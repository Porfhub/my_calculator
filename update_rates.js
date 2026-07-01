const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не установлен в секретах GitHub');
        process.exit(1);
    }
    
    // Используем стабильную конечную точку для обычного текста
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const promptText = `Используй Google Поиск! Найди текущую ключевую ставку ЦБ РФ и средние базовые ставки по коммерческой ипотеке в банках: Сбербанк, ВТБ, Альфа-Банк, Т-Банк, Совкомбанк.
    Напиши ответ СТРОГО в формате JSON-объекта (используй только числа):
    {
        "cb_rate": 14.5,
        "sberbank": 16.8,
        "vtb": 16.9,
        "alfa": 17.1,
        "tbank": 16.5,
        "sovcom": 17.2
    }`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();

        // Проверяем, ответил ли вообще сервер
        if (!result || !result.candidates || !result.candidates[0]) {
            throw new Error('API вернул пустой или некорректный ответ: ' + JSON.stringify(result));
        }

        // Вытаскиваем текст, где бы он ни лежал
        const rawText = result.candidates[0].content.parts[0].text;
        console.log('Сырой ответ от ИИ:', rawText);

        // Магия регулярных выражений: вырезаем JSON из любого текста, даже если ИИ добавил лишние слова или кавычки
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('ИИ не вернул JSON-структуру в тексте');
        }

        const cleanJsonText = jsonMatch[0];
        const parsedData = JSON.parse(cleanJsonText);

        // Проверяем, что все нужные поля на месте, иначе ставим дефолт
        const finalData = {
            cb_rate: parsedData.cb_rate || 14.5,
            sberbank: parsedData.sberbank || 16.8,
            vtb: parsedData.vtb || 16.9,
            alfa: parsedData.alfa || 17.1,
            tbank: parsedData.tbank || 16.5,
            sovcom: parsedData.sovcom || 17.2
        };

        fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
        console.log('Ставки успешно сохранены в rates.json!');
    } catch (error) {
        console.error('Ошибка парсинга:', error.message);
        
        // Супер-подстраховка: если интернет упал или ИИ выдал бред, сайт не должен умереть. Запишем базовые ставки.
        const fallback = { "cb_rate": 14.5, "sberbank": 16.8, "vtb": 16.9, "alfa": 17.1, "tbank": 16.5, "sovcom": 17.2 };
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
        console.log('Записаны дефолтные ставки из-за ошибки.');
    }
}

fetchRates();
