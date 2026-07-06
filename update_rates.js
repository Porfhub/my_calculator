const fs = require('fs');

function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return (isNaN(num) || num === 0) ? fallbackVal : num;
}

async function fetchRates() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: DEEPSEEK_API_KEY не обнаружен.');
        process.exit(1);
    }

    const fallback = { "cb_rate": 21.0, "sberbank": 23.5, "vtb": 23.9, "alfa": 24.1, "tbank": 23.2, "sovcom": 23.8 };
    let cbRateActual = fallback.cb_rate;

    // Шаг 1: Гарантированно берем железную ставку ЦБ напрямую из API Центробанка
    try {
        const cbrResponse = await fetch('https://www.cbr.ru/scripts/xml_main_info.asp');
        const xmlText = await cbrResponse.text();
        const match = xmlText.match(/<keyRate[^>]*>([\s\S]*?)<\/keyRate>/);
        if (match && match[1]) {
            cbRateActual = cleanNum(match[1], fallback.cb_rate);
            console.log('Успешно получена ставка ЦБ из API Центробанка:', cbRateActual);
        }
    } catch (e) {
        console.log('Не удалось достучаться до API СВR, используем базовые маркеры:', e.message);
    }

    // Шаг 2: Идем в DeepSeek за актуализацией банковских коммерческих ставок
    const url = 'https://api.deepseek.com/v1/chat/completions';
    
    const promptText = `Сегодня июль 2026 года. Актуальная ключевая ставка ЦБ РФ составляет ${cbRateActual}%. 
    Спрогнозируй или выведи средние коммерческие ставки по ипотеке без льгот на основе этого контекста для банков: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank.
    Ответь СТРОГО в формате JSON. Никакого текста вокруг, никаких markdown блоков \`\`\`json.
    Структура:
    {
        "sberbank": число,
        "vtb": число,
        "alfa": число,
        "tbank": число,
        "sovcom": число
    }`;

    try {
        console.log('Запускаем генерацию коммерческих ставок через DeepSeek...');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: promptText }],
                temperature: 0.2
            })
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        const rawText = result.choices[0].message.content.trim();
        
        console.log('Ответ от DeepSeek:', rawText);
        const parsedData = JSON.parse(rawText);

        const now = new Date();
        const finalData = {
            cb_rate: cbRateActual,
            sberbank: cleanNum(parsedData.sberbank, fallback.sberbank),
            vtb: cleanNum(parsedData.vtb, fallback.vtb),
            alfa: cleanNum(parsedData.alfa, fallback.alfa),
            tbank: cleanNum(parsedData.tbank, fallback.tbank),
            sovcom: cleanNum(parsedData.sovcom, fallback.sovcom),
            last_updated: now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
        };

        fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
        console.log('Успех! Файл rates.json обновлен:', finalData);

    } catch (error) {
        console.error('Сбой DeepSeek, пишем безопасный конфиг:', error.message);
        const now = new Date();
        fallback.last_updated = now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
