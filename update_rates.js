const fs = require('fs');

// Функция-очиститель: превращает любые строки в корректные числа
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
        
        // Формируем дату: берем текущую дату в формате YYYY-MM-DD
        const nowIso = new Date().toISOString().split('T')[0];

        // Делаем прямой GET запрос к методу GetKeyRate, как указано в документации DailyInfo
        const urlCbr = `https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx/GetKeyRate?fromDate=${nowIso}`;
        
        const cbrResponse = await fetch(urlCbr, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (cbrResponse.ok) {
            const xmlText = await cbrResponse.text();
            
            // Находим все теги <KeyRate> внутри ответа
            const rateMatches = xmlText.match(/<KeyRate[^>]*>([\s\S]*?)<\/KeyRate>/g);
            
            if (rateMatches && rateMatches.length > 0) {
                // Берем самый последний элемент (он хронологически самый актуальный на текущую дату)
                const lastRateBlock = rateMatches[rateMatches.length - 1];
                
                // Вытаскиваем числовое значение ставки из этого блока
                const valueMatch = lastRateBlock.match(/<KeyRate[^>]*>([0-9.,]+)<\/KeyRate>/);
                
                if (valueMatch && valueMatch[1]) {
                    cbRateActual = cleanNum(valueMatch[1], 14.25);
                    console.log('Данные успешно получены напрямую из ЦБ РФ! Текущая ставка:', cbRateActual);
                }
            } else {
                // Если массив пустой (например, на эту секунду записей нет), попробуем вытащить любое первое попавшееся число из тегов
                const singleMatch = xmlText.match(/<KeyRate[^>]*>([0-9.,]+)<\/KeyRate>/);
                if (singleMatch && singleMatch[1]) {
                    cbRateActual = cleanNum(singleMatch[1], 14.25);
                    console.log('Получена одиночная ставка ЦБ РФ:', cbRateActual);
                }
            }
        } else {
            console.log(`Ошибка сервера ЦБ (Статус: ${cbrResponse.status}), применен внутренний расчет.`);
        }
    } catch (e) {
        console.log('Не удалось выполнить парсинг через веб-сервис ЦБ, ошибка:', e.message);
    }
    
    // ШАГ 2: Автоматический расчет коммерческих ставок на чистом JS на основе спредов
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
    console.log('Готово! База rates.json перезаписана:', finalData);
}

fetchRates();
