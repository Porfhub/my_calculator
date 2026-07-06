const fs = require('fs');

// Функция-очиститель строк в числа
function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return isNaN(num) ? fallbackVal : num;
}

async function fetchInflation() {
    console.log('Запрашиваем официальные данные об инфляции с серверов ЦБ РФ...');

    // Базовый архив на случай непредвиденных сбоев структуры XML
    const fallback = {
        "2020": 4.9, "2021": 8.4, "2022": 11.9, "2023": 7.4, "2024": 8.5, "2025": 6.8
    };

    // Используем официальный открытый XML-эндпоинт динамики инфляционных индикаторов ЦБ РФ
    const url = 'https://www.cbr.ru/Queries/UniDbQuery/DownloadExcel/13292?keyIndicatorId=142';

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) throw new Error(`Ошибка сети ЦБ: ${response.status}`);
        
        const xmlText = await response.text();
        const inflationData = {};

        // Парсим XML-структуру ответа регулятора, вытаскивая блоки записей
        // Каждый узел содержит дату (включая год) и итоговое значение инфляции Росстата
        const records = xmlText.match(/<Record[^>]*>([\s\S]*?)<\/Record>/g);

        if (records && records.length > 0) {
            records.forEach(record => {
                // Извлекаем год из атрибута даты или вложенного тега
                const dateMatch = record.match(/Date="[^"]*(\d{4})"/)|| record.match(/<Date>[^<]*(\d{4})<\/Date>/);
                // Извлекаем значение инфляции
                const valueMatch = record.match(/<Value[^>]*>([0-9.,]+)<\/Value>/);

                if (dateMatch && valueMatch) {
                    const year = dateMatch[1];
                    const value = cleanNum(valueMatch[1], null);
                    
                    // Нам нужна годовая инфляция (декабрь к декабрю), поэтому берем последнее зафиксированное значение за каждый год
                    if (value !== null && Number(year) >= 2000 && Number(year) <= 2025) {
                        inflationData[year] = value;
                    }
                }
            });
        }

        // Проверяем, наполнился ли наш объект данными от ЦБ
        if (Object.keys(inflationData).length === 0) {
            throw new Error('Не удалось извлечь структуру данных из XML ответа ЦБ.');
        }

        // Записываем собранные данные в файл
        fs.writeFileSync('inflation.json', JSON.stringify(inflationData, null, 2));
        console.log('Успех! Данные инфляции успешно запарсены с ЦБ РФ и сохранены:', inflationData);

    } catch (error) {
        console.error('Сбой парсинга инфляции с ЦБ, применен безопасный fallback:', error.message);
        fs.writeFileSync('inflation.json', JSON.stringify(fallback, null, 2));
    }
}

fetchInflation();
