const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('КРИТИЧЕСКАЯ ОШИБКА: Ключ GEMINI_API_KEY отсутствует в репозитории!');
        process.exit(1);
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // Пишем промпт на английском (модели Google понимают его на 40% точнее при работе с веб-поиском)
    const promptText = `Using Google Search, find the current official central bank rate of the Russian Federation (CB RF rate) for this month, and the current average mortgage interest rates for commercial banks: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank. Return ONLY a valid JSON object like this: {"cb_rate": 14.5, "sberbank": 16.8, "vtb": 16.9, "alfa": 17.1, "tbank": 16.5, "sovcom": 17.2}`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }]
    };

    try {
        console.log('Отправляем запрос к Gemini API...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        // ВАЖНО: Выводим весь ответ ИИ в логи Гитхаба для полной проверки
        console.log('--- ПОЛНЫЙ ОТВЕТ СЕРВЕРА GOOGLE ---');
        console.log(JSON.stringify(result, null, 2));
        console.log('-----------------------------------');

        if (result.error) {
            console.error('Ошибка от API Google:', result.error.message);
            process.exit(1);
        }

        // Превращаем весь объект ответа в одну большую текстовую строку
        const fullResponseString = JSON.stringify(result);
        
        // Ищем в этом тексте блок JSON со ставками с помощью регулярного выражения
        const jsonMatch = fullResponseString.match(/\{"cb_rate"[\s\S]*?\}/);
        
        if (jsonMatch) {
            const parsedData = JSON.parse(jsonMatch[0]);
            console.log('УРА! Реальные ставки успешно извлечены:', parsedData);
            
            fs.writeFileSync('rates.json', JSON.stringify(parsedData, null, 2));
            return;
        }

        // Если регулярка не нашла наш шаблон, пробуем вытащить любой JSON из текста
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            const textInside = result.candidates[0].content.parts[0].text;
            const fallbackMatch = textInside.match(/\{[\s\S]*?\}/);
            if (fallbackMatch) {
                fs.writeFileSync('rates.json', JSON.stringify(JSON.parse(fallbackMatch[0]), null, 2));
                console.log('Ставки вытащены через резервный текстовый поиск!');
                return;
            }
        }

        console.error('Не удалось найти JSON со ставками в ответе ИИ. Скрипт остановлен.');
        process.exit(1);

    } catch (error) {
        console.error('Критический сбой выполнения скрипта:', error.message);
        process.exit(1);
    }
}

fetchRates();
