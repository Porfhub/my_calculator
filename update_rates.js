const fs = require('fs');

// Функция-очиститель: преобразует строки с запятыми в нормальные числа
function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return (isNaN(num) || num === 0) ? fallbackVal : num;
}

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен.');
        process.exit(1);
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    let cbRateActual = 21.0; // Базовое значение по умолчанию

    // ШАГ 1: Извлекаем самую последнюю и актуальную ставку напрямую из API Центробанка РФ
    try {
        const cbrResponse = await fetch('https://www.cbr.ru/scripts/xml_main_info.asp');
        const xmlText = await cbrResponse.text();
        
        // Изолируем блок ключевой ставки
        const keyRateBlock = xmlText.match(/<keyRate[^>]*>([\s\S]*?)<\/keyRate>/);
        
        if (keyRateBlock && keyRateBlock[1]) {
            // Находим все элементы <item> внутри блока
            const items = keyRateBlock[1].match(/<item[^>]*>([\s\S]*?)<\/item>/g);
            
            if (items && items.length > 0) {
                // Берем самый последний (самый свежий по дате) элемент
                const lastItem = items[items.length - 1];
                const valueMatch = lastItem.match(/<item[^>]*>([\s\S]*?)<\/item>/);
                
                if (valueMatch && valueMatch[1]) {
                    cbRateActual = cleanNum(valueMatch[1], 21.0);
                    console.log('Успешно получена АКТУАЛЬНАЯ ставка ЦБ из API Центробанка:', cbRateActual);
                }
            }
        }
    } catch (e) {
        console.log('Не удалось достучаться до API CBR, берем базовый маркер:', e.message);
    }
    
    // ШАГ 2: Передаем точную ставку ЦБ в Gemini для расчета коммерческих ипотечных спредов топ-5 банков
    // Поиск в интернете отключен — это чистый, легкий и бесплатный текстовый запрос
    const promptText = `You are a financial assistant. Today is July 2026. The official key interest rate of the Central Bank of Russia is exactly ${cbRateActual}%.
    Based on historical data and the typical structural spread/margin that major Russian commercial banks add to the key rate for standard mortgage programs (non-subsidized, retail loans), calculate the realistic average mortgage rates for: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank.
    Return ONLY a valid JSON object. No markdown blocks, no text.
    Structure: {"sberbank": 0.0, "vtb": 0.0, "alfa": 0.0, "tbank": 0.0, "sovcom": 0.0}`;

    try {
        console.log('Запускаем текстовый расчет коммерческих ставок через Gemini (Без поиска)...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }] // Без использования tools
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            throw new Error(`Google API Error: ${result.error.message}`);
        }

        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('ИИ вернул пустой текстовый блок.');

        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) throw new Error('Валидный JSON объект не найден в ответе.');
        
        const parsedData = JSON.parse(jsonMatch[0]);

        const now = new Date();
        const finalData = {
            cb_rate: cbRateActual,
            sberbank: cleanNum(parsedData.sberbank, cbRateActual + 2.5),
            vtb: cleanNum(parsedData.vtb, cbRateActual + 2.9),
            alfa: cleanNum(parsedData.alfa, cbRateActual + 3.1),
            tbank: cleanNum(parsedData.tbank, cbRateActual + 2.2),
            sovcom: cleanNum(parsedData.sovcom, cbRateActual + 2.8),
            last_updated: now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
        };
        
        fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
        console.log('Успех! База rates.json успешно обновлена данными:', finalData);

    } catch (error) {
        console.error('Сбой расчета, применен безопасный fallback:', error.message);
        const now = new Date();
        const fallback = {
            "cb_rate": cbRateActual,
            "sberbank": cbRateActual + 2.5,
            "vtb": cbRateActual + 2.9,
            "alfa": cbRateActual + 3.1,
            "tbank": cbRateActual + 2.2,
            "sovcom": cbRateActual + 2.8,
            "last_updated": now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
        };
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
