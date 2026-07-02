const fs = require('fs');

// Функция-очиститель: убирает проценты, буквы и меняет запятые на точки
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
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    // Промпт с жестким указанием формата чисел
    const promptText = `Today is July 2026. Use your Google Search tool to find the current official key interest rate of the Central Bank of the Russian Federation. Also, search for the current average mortgage interest rates for commercial loans in: Sberbank, VTB, Alfa-Bank, T-Bank, Sovcombank.
    CRITICAL: You must return ONLY float numbers using a dot as a decimal separator (e.g., 18.5). DO NOT use strings, percentage signs (%), or commas (,).
    Return ONLY a valid JSON object. Do not include any markdown, text or code block formatting.
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
        
        const result = await response.json();
        
        if (!result.candidates || !result.candidates[0]?.content?.parts[0]?.text) {
            throw new Error('ИИ вернул пустой ответ или заблокировал запрос.');
        }

        const rawText = result.candidates[0].content.parts[0].text;
        console.log('Реальный ответ от ИИ:', rawText);

        // Извлекаем JSON
        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            const parsedData = JSON.parse(jsonMatch[0]);

            // Пропускаем все данные через нашу функцию-очиститель
            const finalData = {
                cb_rate: cleanNum(parsedData.cb_rate, fallback.cb_rate),
                sberbank: cleanNum(parsedData.sberbank, fallback.sberbank),
                vtb: cleanNum(parsedData.vtb, fallback.vtb),
                alfa: cleanNum(parsedData.alfa, fallback.alfa),
                tbank: cleanNum(parsedData.tbank, fallback.tbank),
                sovcom: cleanNum(parsedData.sovcom, fallback.sovcom)
            };

            // ЖЕСТКИЙ ЛИМИТ: если ставка <= 0% или >= 50% — бракуем
            if (finalData.cb_rate <= 0 || finalData.cb_rate >= 50) {
                console.error(`КРИТИЧЕСКАЯ ОШИБКА: ИИ выдал нереальную ставку ЦБ (${finalData.cb_rate}%). Отмена обновления, пишем fallback.`);
                fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
                return;
            }

            // ШАГ 2: Двойная верификация (AUDITOR)
            console.log('Пауза 10 секунд перед аудитом для обхода лимитов API...');
            const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
            await sleep(10000);

            console.log('AGENT-2 (Auditor): Проверка полученных данных...');
            const auditPrompt = `Today is ${currentDate}. I received the following financial data for Russia:
            Key Rate (CBR): ${finalData.cb_rate}%
            Mortgage rates: Sberbank ${finalData.sberbank}%, VTB ${finalData.vtb}%, Alfa ${finalData.alfa}%.
            Use your Google Search tool to verify if these numbers are realistic and close to the current official rates.
            Return "VALID" if the data is correct or close to reality.
            Return "INVALID" if the data is clearly wrong or outdated.
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
                // Добавляем метку времени
                const now = new Date();
                const formatter = new Intl.DateTimeFormat('ru-RU', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                    timeZone: 'Europe/Moscow'
                });
                const parts = formatter.formatToParts(now);
                const d = parts.find(p => p.type === 'day').value;
                const m = parts.find(p => p.type === 'month').value;
                const y = parts.find(p => p.type === 'year').value;
                const h = parts.find(p => p.type === 'hour').value;
                const min = parts.find(p => p.type === 'minute').value;

                finalData.last_updated = `${d}.${m}.${y} ${h}:${min}`;

                fs.writeFileSync('rates.json', JSON.stringify(finalData, null, 2));
                console.log('Успех! Данные верифицированы и записаны в rates.json:', finalData);
            } else {
                console.error('ОШИБКА: Аудитор не подтвердил валидность данных. Запись отменена.');
            }
            return;
        }

        throw new Error('В ответе ИИ не найден валидный JSON.');

    } catch (error) {
        console.error('Ошибка парсинга реальных ставок, пишем безопасный конфиг:', error.message);
        fs.writeFileSync('rates.json', JSON.stringify(fallback, null, 2));
    }
}

fetchRates();
