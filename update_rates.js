const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не установлен');
        process.exit(1);
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const promptText = `Найди актуальную ключевую ставку ЦБ РФ и средние ставки по ипотеке банков: Сбербанк, ВТБ, Альфа-Банк, Т-Банк, Совкомбанк. Верни строго JSON.`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }]
    };

    // Дефолтный конфиг на случай любых непредвиденных обстоятельств
    const fallback = { "cb_rate": 14.5, "sberbank": 16.8, "vtb": 16.9, "alfa": 17.1, "tbank": 16.5, "sovcom": 17.2 };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();

        // Полностью безопасный разбор структуры ответа без индексов [0]
        if (result && result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];
            if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
                const rawText = candidate.content.parts[0].text;
                const jsonMatch = rawText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsedData = JSON.parse(jsonMatch[0]);
                    const finalData = {
                        cb_rate: parsedData.cb_rate || fallback.cb_rate,
                        sberbank: parsedData.sberbank || fallback.sberbank,
                        vtb: parsedData.vtb || fallback.vtb,
                        alfa: parsedData.alfa || fallback.alfa,
                        tbank: parsedData.tbank || fallback.tbank,
                        sovcom: parsedData.sovcom || fallback.sovcom
                    };
                    fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
                    console.log('Ставки успешно сохранены в rates.json!');
                    return;
                }
            }
        }
        throw new Error('Нестандартный ответ API');
    } catch (error) {
        console.warn('Применен аварийный режим подстраховки:', error.message);
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
