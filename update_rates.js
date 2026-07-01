const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен в переменных окружения.');
        process.exit(1);
    }
    
    // Используем стабильную конечную точку для работы со свободным текстом
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

    // Дефолтный конфиг-страховка на случай сбоев сети
    const fallback = { "cb_rate": 14.5, "sberbank": 16.8, "vtb": 16.9, "alfa": 17.1, "tbank": 16.5, "sovcom": 17.2 };

    try {
        console.log('Отправляем запрос к Google Gemini...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        // Переводим весь объект в строку, чтобы не зависеть от структуры кандидатов
        const responseString = JSON.stringify(result);
        console.log('Вывод ответа для отладки:', responseString);

        // Ищем регулярным выражением JSON-блок внутри ответа
        const jsonMatch = responseString.match(/\{"cb_rate"[\s\S]*?\}/);
        
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
            console.log('Ставки успешно обновлены и записаны в rates.json!');
            return;
        }

        console.warn('ИИ ответил не по шаблону. Применяем подстраховку.');
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));

    } catch (error) {
        console.error('Произошла ошибка при парсинге, пишем дефолтные ставки:', error.message);
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
