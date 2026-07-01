const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен в переменных окружения.');
        process.exit(1);
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Формируем жесткий промпт БЕЗ цифр-примеров, заставляя ИИ включить поиск
    const promptText = `Today is July 2026. Use your Google Search tool right now to find the current official key interest rate of the Central Bank of the Russian Federation (cbr.ru). Also, search for the latest average mortgage interest rates for commercial loans in the following Russian banks: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank. 
    You must extract the real numbers from the search results. Return ONLY a valid JSON object. Do not include any markdown, text or code block formatting.
    The JSON structure must strictly be:
    {
        "cb_rate": [put searched number here],
        "sberbank": [put searched number here],
        "vtb": [put searched number here],
        "alfa": [put searched number here],
        "tbank": [put searched number here],
        "sovcom": [put searched number here]
    }`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }]
    };

    const fallback = { "cb_rate": 14.5, "sberbank": 16.8, "vtb": 16.9, "alfa": 17.1, "tbank": 16.5, "sovcom": 17.2 };

    try {
        console.log('Запускаем реальный поиск ставок через Gemini...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (!result.candidates || !result.candidates[0]?.content?.parts[0]?.text) {
            throw new Error('ИИ вернул пустой ответ или заблокировал запрос.');
        }

        const rawText = result.candidates[0].content.parts[0].text;
        console.log('Реальный ответ от ИИ:', rawText);

        // Извлекаем JSON
        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            const parsedData = JSON.parse(jsonMatch[0]);
            
            // Проверяем, что ИИ прислал реальные новые числа, а не пустые строки
            const finalData = {
                cb_rate: Number(parsedData.cb_rate) || fallback.cb_rate,
                sberbank: Number(parsedData.sberbank) || fallback.sberbank,
                vtb: Number(parsedData.vtb) || fallback.vtb,
                alfa: Number(parsedData.alfa) || fallback.alfa,
                tbank: Number(parsedData.tbank) || fallback.tbank,
                sovcom: Number(parsedData.sovcom) || fallback.sovcom
            };
            
            fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
            console.log('Успех! В rates.json записаны свежие данные поиска:', finalData);
            return;
        }

        throw new Error('В ответе ИИ не найден валидный JSON.');

    } catch (error) {
        console.error('Ошибка парсинга реальных ставок, пишем безопасный конфиг:', error.message);
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
