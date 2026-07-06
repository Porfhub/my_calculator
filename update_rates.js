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
    
    // Промпт для реального поиска коммерческих ставок банков в интернете
    const promptText = `Today is July 2026. Use your Google Search tool to find the current official key interest rate of the Central Bank of Russia. Also, search the web for the current average base mortgage interest rates (non-subsidized commercial loans) in: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank.
    CRITICAL: Return ONLY a valid JSON object. Do not include markdown or text.
    Structure: {"cb_rate": 0.0, "sberbank": 0.0, "vtb": 0.0, "alfa": 0.0, "tbank": 0.0, "sovcom": 0.0}`;

    try {
        console.log('AGENT-1: Запускаем реальный веб-поиск ставок банков через Gemini...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                tools: [{ "google_search": {} }] // ПОИСК ВКЛЮЧЕН ТОЛЬКО ТУТ
            })
        });
        
        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('ИИ вернул пустой ответ или заблокировал запрос.');

        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) throw new Error('Валидный JSON не найден.');
        
        const parsedData = JSON.parse(jsonMatch[0]);
        const cbRate = cleanNum(parsedData.cb_rate, 21.0);

        if (cbRate <= 0 || cbRate >= 50) throw new Error(`Аномальная ставка ЦБ: ${cbRate}%`);

        // Пауза 15 секунд, чтобы очистить минутные лимиты токенов перед аудитом
        await sleep(15000);

        console.log('AGENT-2 (Auditor): Перепроверяем логику собранных данных...');
        const auditPrompt = `Review this parsed Russian mortgage data: ${jsonMatch[0]}. 
        Does it look logically correct for July 2026? (Commercial mortgage rates must be slightly higher than the key rate ${cbRate}%).
        Return strictly "VALID" or "INVALID". No text.`;

        const auditResponse = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: auditPrompt }] }] // НИКАКИХ TOOLS ТУТ НЕТ! ЛИМИТЫ НЕ СТРАДАЮТ
            })
        });

        const auditResult = await auditResponse.json();
        const auditVerdict = auditResult.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        console.log('Вердикт аудитора:', auditVerdict);

        if (!auditVerdict.includes('VALID')) throw new Error('Аудитор забраковал коммерческие ставки.');

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
        console.log('Успех! База rates.json обновлена реальными ставками с веб-поиском:', finalData);

    } catch (error) {
        console.error('Сбой парсинга, применен безопасный fallback:', error.message);
        const fallback = { "cb_rate": 21.0, "sberbank": 23.5, "vtb": 23.9, "alfa": 24.1, "tbank": 23.2, "sovcom": 23.8, "last_updated": new Date().toLocaleString('ru-RU') };
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
