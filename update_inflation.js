const fs = require('fs');

function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return isNaN(num) ? fallbackVal : num;
}

async function fetchInflation() {
    console.log('Запрашиваем актуальные макропоказатели с серверов ЦБ РФ...');

    // 1. Железобетонный исторический архив Росстата (эти цифры уже никогда не изменятся)
    const inflationData = {
        "2000": 20.2, "2001": 18.6, "2002": 15.1, "2003": 12.0, "2004": 11.7,
        "2005": 10.9, "2006": 9.0, "2007": 11.9, "2008": 13.3, "2009": 8.8,
        "2010": 8.8, "2011": 6.1, "2012": 6.6, "2013": 6.5, "2014": 11.4,
        "2015": 12.9, "2016": 5.4, "2017": 2.5, "2018": 4.3, "2019": 3.0,
        "2020": 4.9, "2021": 8.4, "2022": 11.9, "2023": 7.4, "2024": 8.5
    };

    // Значения по умолчанию для текущих периодов на случай сбоя сети
    inflationData["2025"] = 6.8;

    // 2. Живой добор текущих данных через официальный XML-эндпоинт главных индикаторов ЦБ
    const url = 'https://www.cbr.ru/scripts/xml_main_info.asp';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (response.ok) {
            const xmlText = await response.text();
            
            // Ищем блок инфляции в XML структуре главного информера ЦБ
            const inflationBlock = xmlText.match(/<inflation[^>]*>([\s\S]*?)<\/inflation>/);
            
            if (inflationBlock && inflationBlock[1]) {
                // Вытаскиваем текущее значение инфляции (например, за последний месяц/год)
                const valueMatch = inflationBlock[1].match(/<Value[^>]*>([0-9.,]+)<\/Value>/);
                const dateMatch = inflationBlock[1].match(/date="[^"]*(\d{4})"/);
                
                if (valueMatch) {
                    const parsedValue = cleanNum(valueMatch[1], null);
                    // Если ЦБ отдает актуальный год (например 2025 или 2026), динамически обновляем его в базе
                    const targetYear = dateMatch ? dateMatch[1] : "2025";
                    
                    if (parsedValue !== null) {
                        inflationData[targetYear] = parsedValue;
                        console.log(`Данные ЦБ успешно получены! Инфляция за ${targetYear} год обновлена: ${parsedValue}%`);
                    }
                }
            }
        } else {
            console.log(`ЦБ вернул статус ${response.status}. Используем архивные показатели инфляции.`);
        }
    } catch (error) {
        console.log('Не удалось обновить текущий год через API ЦБ (используем базовый архив):', error.message);
    }

    // 3. Сохраняем финальный чистый JSON-объект
    try {
        fs.writeFileSync('inflation.json', JSON.stringify(inflationData, null, 2));
        console.log('Успех! Файл inflation.json полностью обновлен и сохранен.');
    } catch (error) {
        console.error('Критическая ошибка записи файла:', error.message);
    }
}

fetchInflation();
