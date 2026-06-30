const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не установлен');
        process.exit(1);
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    // Промпт теперь более жестко требует независимые ставки и поиск на cbr.ru
    const promptText = `Найди актуальную официальную ключевую ставку ЦБ РФ на сегодняшний день (зайди на www.cbr.ru) и средние базовые ставки по коммерческой ипотеке в банках: Сбербанк, ВТБ, Альфа-Банк, Т-Банк, Совкомбанк.
    ВАЖНО: Ключевая ставка ЦБ должна быть строго из официальных источников. Ставки банков должны быть реальными рыночными значениями, НЕ рассчитывай их математически от ставки ЦБ.
    Верни СТРОГО JSON без лишнего текста:
    {
        "cb_rate": 0.0,
        "sberbank": 0.0,
        "vtb": 0.0,
        "alfa": 0.0,
        "tbank": 0.0,
        "sovcom": 0.0
    }`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }],
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!result.candidates || !result.candidates[0].content.parts[0].text) {
            throw new Error('Не удалось получить данные от Gemini: ' + JSON.stringify(result));
        }

        const dataText = result.candidates[0].content.parts[0].text;
        const parsedData = JSON.parse(dataText);

        fs.writeFileSync('rates.json', JSON.stringify(parsedData, null, 2));
        console.log('Ставки успешно обновлены в rates.json!');
        console.log('Данные:', dataText);
    } catch (error) {
        console.error('Ошибка при обновлении ставок:', error);
        process.exit(1);
    }
}

fetchRates();
