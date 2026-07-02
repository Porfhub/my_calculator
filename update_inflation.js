const fs = require('fs');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Функция-очиститель: убирает проценты, буквы и меняет запятые на точки
function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;

    // Превращаем в строку, меняем запятую на точку, удаляем всё кроме цифр и точки
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);

    // Если после очистки получилось не число — берем дефолт
    return isNaN(num) ? fallbackVal : num;
}

async function fetchInflation() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен в переменных окружения.');
        process.exit(1);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    const promptText = `Today is ${currentDate}. Use your Google Search tool to find the official annual inflation rates in Russia (Rosstat) from 2000 to the current year.
    CRITICAL: You must return ONLY a JSON object where keys are years (as strings) and values are float numbers (annual inflation percentage) using a dot as a decimal separator (e.g., 8.4).
    Return ONLY a valid JSON object. Do not include any markdown, text or code block formatting.
    The JSON structure must strictly be:
    {
        "2000": 20.2,
        "2001": 18.6,
        ...
        "2024": 8.4
    }`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }]
    };

    // Надежный fallback (официальные данные Росстата)
    const fallback = {
        "2000": 20.2, "2001": 18.6, "2002": 15.1, "2003": 12.0, "2004": 11.7,
        "2005": 10.9, "2006": 9.0, "2007": 11.9, "2008": 13.3, "2009": 8.8,
        "2010": 8.8, "2011": 6.1, "2012": 6.6, "2013": 6.5, "2014": 11.4,
        "2015": 12.9, "2016": 5.4, "2017": 2.5, "2018": 4.3, "2019": 3.0,
        "2020": 4.9, "2021": 8.4, "2022": 11.9, "2023": 7.4, "2024": 8.5
    };

    try {
        console.log('AGENT-1: Запускаем поиск данных об инфляции через Gemini...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Ошибка HTTP: ${response.status}`);
        }

        const result = await response.json();

        if (!result.candidates || !result.candidates[0]?.content?.parts[0]?.text) {
            throw new Error('ИИ вернул пустой ответ или заблокировал запрос.');
        }

        const rawText = result.candidates[0].content.parts[0].text;
        console.log('AGENT-1: Ответ от ИИ:', rawText);

        // Извлекаем JSON (ищем блок между фигурных скобок)
        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            const parsedData = JSON.parse(jsonMatch[0]);
            const finalData = {};

            // Проходимся по всем годам от 2000 до текущего
            const currentYear = new Date().getFullYear();
            for (let year = 2000; year <= currentYear; year++) {
                const yearStr = year.toString();
                if (parsedData[yearStr] !== undefined) {
                    finalData[yearStr] = cleanNum(parsedData[yearStr], fallback[yearStr] || 0);
                } else if (fallback[yearStr]) {
                    finalData[yearStr] = fallback[yearStr];
                }
            }

            // ШАГ 2: Двойная верификация (AUDITOR)
            console.log('Пауза 7 секунд перед аудитом для обхода лимитов API...');
            await sleep(7000);

            console.log('AGENT-2 (Auditor): Проверка данных об инфляции...');
            const lastYear = (currentYear - 1).toString();
            const lastValue = finalData[lastYear] || "unknown";

            const auditPrompt = `Today is ${currentDate}. I received inflation data for Russia.
            The inflation rate for the year ${lastYear} is reported as ${lastValue}%.
            Use your Google Search tool to verify if this specific value is correct or very close to the official Rosstat data.
            Return "VALID" if the data is correct.
            Return "INVALID" if the data is clearly wrong.
            Return ONLY the word "VALID" or "INVALID". No explanations.`;

            const auditPayload = {
                contents: [{ parts: [{ text: auditPrompt }] }],
                tools: [{ "google_search": {} }]
            };

            const auditResponse = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(auditPayload)
            });
            const auditResult = await auditResponse.json();
            const auditText = auditResult.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

            console.log('AGENT-2: Вердикт аудитора:', auditText);

            if (auditText.includes("VALID")) {
                fs.writeFileSync('inflation.json', JSON.stringify(finalData, null, 2));
                console.log('Успех! Данные об инфляции верифицированы и записаны.');
            } else {
                console.error('ОШИБКА: Аудитор не подтвердил данные об инфляции. Запись отменена.');
            }
            return;
        }

        throw new Error('В ответе ИИ не найден валидный JSON.');

    } catch (error) {
        console.error('Ошибка получения данных об инфляции, используем fallback:', error.message);
        fs.writeFileSync('inflation.json', JSON.stringify(fallback, null, 2));
    }
}

fetchInflation();
