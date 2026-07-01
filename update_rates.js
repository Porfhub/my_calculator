const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не установлен в секретах GitHub');
        process.exit(1);
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const promptText = `Используй встроенный инструмент поиска Google! Найди самую актуальную на сегодняшний день ключевую ставку ЦБ РФ, а также средние текущие базовые ставки по ипотеке на коммерческую недвижимость в банках: Сбербанк, ВТБ, Альфа-Банк, Т-Банк, Совкомбанк. Заполни числовые значения в процентах.`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }],
        generationConfig: { 
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    cb_rate: { type: "NUMBER" },
                    sberbank: { type: "NUMBER" },
                    vtb: { type: "NUMBER" },
                    alfa: { type: "NUMBER" },
                    tbank: { type: "NUMBER" },
                    sovcom: { type: "NUMBER" }
                },
                required: ["cb_rate", "sberbank", "vtb", "alfa", "tbank", "sovcom"]
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();

        if (result.error) {
            throw new Error(`Gemini API вернул ошибку: ${JSON.stringify(result.error)}`);
        }

        if (!result.candidates || !result.candidates[0] || !result.candidates[0].content || !result.candidates[0].content.parts[0].text) {
            throw new Error(`Не удалось распарсить структуру ответа. Полный ответ API: ${JSON.stringify(result)}`);
        }

        const dataText = result.candidates[0].content.parts[0].text;
        const parsedData = JSON.parse(dataText);

        fs.writeFileSync('rates.json', JSON.stringify(parsedData, null, 2));
        console.log('Ставки успешно сохранены в rates.json!');
        console.log('Свежие данные:', dataText);
    } catch (error) {
        console.error('Критическая ошибка при обновлении ставок:', error.message);
        process.exit(1);
    }
}

fetchRates();
