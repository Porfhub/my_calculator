const fs = require('fs');

// Функция-очиститель: убирает буквы и меняет запятые на точки
function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    
    // Превращаем в строку, меняем запятую на точку, удаляем всё кроме цифр и точки
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    
    // Если после очистки получилось не число или 0 — берем дефолт
    return (isNaN(num) || num === 0) ? fallbackVal : num;
}

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен в переменных окружения.');
        process.exit(1);
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    // 1. ИСПРАВЛЕНИЕ: Динамическая дата. Теперь скрипт всегда знает актуальный месяц и год.
    const now = new Date();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonthYear = `${months[now.getMonth()]} ${now.getFullYear()}`;
    
    // Промпт с жестким указанием формата чисел и новой просьбой обернуть ответ в ```json
    const promptText = `Today is ${currentMonthYear}. Use your Google Search tool to find the current official key interest rate of the Central Bank of the Russian Federation. Also, search for the current average mortgage interest rates for commercial loans in: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank. 
    CRITICAL: You must return ONLY float numbers using a dot as a decimal separator (e.g., 18.5). DO NOT use strings, percentage signs (%), or commas (,).
    Wrap your JSON response strictly inside a \`\`\`json block.
    The JSON structure must strictly be:
    {
        "cb_rate": [insert float number here],
        "sberbank": [insert float number here],
        "vtb": [insert float number here],
        "alfa": [insert float number here],
        "tbank": [insert float number here],
        "sovcom": [insert float number here]
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
        
        // 2. ИСПРАВЛЕНИЕ: Проверка статуса HTTP перед парсингом. 
        // Если сервер ответит 500 ошибкой, скрипт сразу уйдет в catch, а не сломается на .json()
        if (!response.ok) {
            throw new Error(`Ошибка HTTP! Статус сервера: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.candidates || !result.candidates[0]?.content?.parts[0]?.text) {
            throw new Error('ИИ вернул пустой ответ или заблокировал запрос.');
        }

        const rawText = result.candidates[0].content.parts[0].text;
        console.log('Реальный ответ от ИИ:', rawText);

        // 3. ИСПРАВЛЕНИЕ: Умный поиск JSON. 
        // Сначала ищем блок ```json ... ```, если его нет — ищем от первой { до последней }
        let jsonStr = '';
        const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        
        if (codeBlockMatch && codeBlockMatch[1]) {
            jsonStr = codeBlockMatch[1];
        } else {
            const start = rawText.indexOf('{');
            const end = rawText.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                jsonStr = rawText.slice(start, end + 1);
            }
        }

        if (!jsonStr) {
            throw new Error('В ответе ИИ не найден валидный JSON.');
        }

        const parsedData = JSON.parse(jsonStr);
        
        // Пропускаем все данные через нашу функцию-очиститель
        const finalData = {
            cb_rate: cleanNum(parsedData.cb_rate, fallback.cb_rate),
            sberbank: cleanNum(parsedData.sberbank, fallback.sberbank),
            vtb: cleanNum(parsedData.vtb, fallback.vtb),
            alfa: cleanNum(parsedData.alfa, fallback.alfa),
            tbank: cleanNum(parsedData.tbank, fallback.tbank),
            sovcom: cleanNum(parsedData.sovcom, fallback.sovcom)
        };
        
        fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
        console.log('Успех! В rates.json записаны чистые свежие данные:', finalData);

    } catch (error) {
        console.error('Ошибка парсинга реальных ставок, пишем безопасный конфиг:', error.message);
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
