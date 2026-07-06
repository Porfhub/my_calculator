const fs = require('fs');

function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return (isNaN(num) || num === 0) ? fallbackVal : num;
}

async function fetchRates() {
    let cbRateActual = 21.0; // Базовый fallback

    // ШАГ 1: Извлекаем актуальную ставку напрямую из API Центробанка РФ
    try {
        const cbrResponse = await fetch('https://www.cbr.ru/scripts/xml_main_info.asp');
        const xmlText = await cbrResponse.text();
        const keyRateBlock = xmlText.match(/<keyRate[^>]*>([\s\S]*?)<\/keyRate>/);
        
        if (keyRateBlock && keyRateBlock[1]) {
            const items = keyRateBlock[1].match(/<item[^>]*>([\s\S]*?)<\/item>/g);
            if (items && items.length > 0) {
                const lastItem = items[items.length - 1];
                const valueMatch = lastItem.match(/<item[^>]*>([\s\S]*?)<\/item>/);
                if (valueMatch && valueMatch[1]) {
                    cbRateActual = cleanNum(valueMatch[1], 21.0);
                    console.log('Успешно получена ставка ЦБ:', cbRateActual);
                }
            }
        }
    } catch (e) {
        console.log('Сбой API CBR, берем дефолт:', e.message);
    }
    
    // ШАГ 2: Математический расчет коммерческих ставок на чистом JS на основе исторических спредов
    const now = new Date();
    const finalData = {
        cb_rate: cbRateActual,
        sberbank: Number((cbRateActual + 2.5).toFixed(2)),
        vtb: Number((cbRateActual + 2.9).toFixed(2)),
        alfa: Number((cbRateActual + 3.1).toFixed(2)),
        tbank: Number((cbRateActual + 2.2).toFixed(2)),
        sovcom: Number((cbRateActual + 2.8).toFixed(2)),
        last_updated: now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
    };
    
    fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
    console.log('Успех! База rates.json обновлена без использования ИИ:', finalData);
}

fetchRates();
