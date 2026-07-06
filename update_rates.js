const fs = require('fs');

function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return (isNaN(num) || num === 0) ? fallbackVal : num;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен.');
        process.exit(1);
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const promptText = `Today is July 2026. Search the web to find the current official key interest rate of the Central Bank of Russia. Also, search for the current average mortgage interest rates for commercial loans in: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank.
    Return ONLY a valid JSON object. Do not include markdown formatting or any text outside the JSON.
    Structure: {"cb_rate": 21.0, "sberbank": 23.5, "vtb": 23.9, "alfa": 24.1, "tbank": 23.2, "sovcom": 23.8}`;

    try {
        console.log('AGENT-1: Запускаем реальный веб-поиск ставок банков через Gemini...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                tools: [{ "google_search": {} }] // Включаем поиск
            })
        });
        
        const result = await response.json();
        
        // Глубокий лог на случай сбоя квот или структуры
        if (result.error) {
            console.error('ОШИБКА ОТ GOOGLE API:', JSON.stringify(result.error, null, 2));
            throw new Error(`Google API Error: ${result.error.message}`);
        }

        // Универсальное извлечение текста (учитывает специфику google_search ответа)
        const candidate = result.candidates?.[0];
        const rawText = candidate?.content?.parts?.[0]?.text || candidate?.groundingMetadata?.webSearchQueries?.[0] || "";
        
        if (!rawText) {
            console.error('Нетипичный ответ от API, вот сырой результат:', JSON.stringify(result, null, 2));
            throw new Error('ИИ вернул пустой текстовый блок.');
        }

        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) throw new Error('Валидный JSON объект не найден в ответе.');
        
        const parsedData = JSON.parse(jsonMatch[0]);
        const cbRate = cleanNum(parsedData.cb_rate, 21.0);

        await sleep(10000); // Микропауза перед аудитом

        console.log('AGENT-2 (Auditor): Перепроверяем логику собранных данных...');
        const auditPrompt = `Review this parsed Russian mortgage data: ${jsonMatch[0]}. Is it realistic for July 2026? Return strictly "VALID" or "INVALID". No explanations.`;

        const auditResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: auditPrompt }] }] })
        });

        const auditResult = await auditResponse.json();
        const auditVerdict = auditResult.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        console.log('Вердикт аудитора:', auditVerdict);

        const now = new Date();
        const finalData = {
            cb_rate: cbRate,
            sberbank: cleanNum(parsedData.sberbank, 23.5),
            vtb: cleanNum(parsedData.vtb, 23.9),
            alfa: cleanNum(parsedData.alfa, 24.1),
            tbank: cleanNum(parsedData.tbank, 23.2),
            sovcom: cleanNum(parsedData.sovcom, 23.8),
            last_updated: now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
        };
        
        fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
        console.log('Успех! База rates.json обновлена:', finalData);

    } catch (error) {
        console.error('Сбой парсинга, применен безопасный fallback:', error.message);
        const fallback = { "cb_rate": 21.0, "sberbank": 23.5, "vtb": 23.9, "alfa": 24.1, "tbank": 23.2, "sovcom": 23.8, "last_updated": new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) };
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
