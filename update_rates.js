const fs = require('fs');

function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return (isNaN(num) || num === 0) ? fallbackVal : num;
}

async function fetchRates() {
    let cbRateActual = 14.25; // Базовый fallback

    // ШАГ 1: GET-запрос к официальному веб-сервису ЦБ РФ (DailyInfo)
    try {
        console.log('Запрашиваем актуальную ключевую ставку через DailyInfo API (HTTP GET)...');
        const nowIso = new Date().toISOString().split('T')[0];
        const urlCbr = `https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx/GetKeyRate?fromDate=${nowIso}`;
        
        const cbrResponse = await fetch(urlCbr, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (cbrResponse.ok) {
            const xmlText = await cbrResponse.text();
            const rateMatches = xmlText.match(/<KeyRate[^>]*>([\s\S]*?)<\/KeyRate>/g);
            
            if (rateMatches && rateMatches.length > 0) {
                const lastRateBlock = rateMatches[rateMatches.length - 1];
                const valueMatch = lastRateBlock.match(/<KeyRate[^>]*>([0-9.,]+)<\/KeyRate>/);
                if (valueMatch && valueMatch[1]) {
                    cbRateActual = cleanNum(valueMatch[1], 14.25);
                    console.log('Данные успешно получены напрямую из ЦБ РФ! Текущая ставка:', cbRateActual);
                }
            } else {
                const singleMatch = xmlText.match(/<KeyRate[^>]*>([0-9.,]+)<\/KeyRate>/);
                if (singleMatch && singleMatch[1]) {
                    cbRateActual = cleanNum(singleMatch[1], 14.25);
                }
            }
        } else {
            console.log(`Ошибка сервера ЦБ (Статус: ${cbrResponse.status}), применен внутренний расчет.`);
        }
    } catch (e) {
        console.log('Не удалось выполнить парсинг через веб-сервис ЦБ, ошибка:', e.message);
    }
    
    // ШАГ 2: Автоматический расчет коммерческих ставок на основе твоих точных спредов
    const now = new Date();
    const finalData = {
        cb_rate: cbRateActual,
        sberbank: Number((cbRateActual + 1.65).toFixed(2)),
        vtb: Number((cbRateActual + 1.95).toFixed(2)),
        alfa: Number((cbRateActual + 2.45).toFixed(2)),
        tbank: Number((cbRateActual + 2.65).toFixed(2)),
        sovcom: Number((cbRateActual + 3.75).toFixed(2)),
        last_updated: now.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
    };
    
    fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
    console.log('Готово! База rates.json перезаписана с новыми спредами:', finalData);
}

fetchRates();
