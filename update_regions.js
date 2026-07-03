const fs = require('fs');

// Функция-очиститель
function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return (isNaN(num) || num === 0) ? fallbackVal : num;
}

async function fetchRegions() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен.');
        process.exit(1);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const promptText = `Find current official economic statistics for the top 50 regions of Russia (subjects of the federation).
    Include: Moscow, Saint Petersburg, Tatarstan, Bashkortostan, Sverdlovsk Region, Krasnodar Krai, Novosibirsk Region, Chuvash Republic, Saratov Region, and 40 others.
    For each region, provide:
    1. "id": A short unique uppercase code (e.g., MSK, SPB, CHU, SAR).
    2. "name": Full name in Russian (e.g., "Чувашская Республика").
    3. "median": Median monthly salary (gross, before taxes) in RUB.
    4. "avg": Average monthly salary (gross, before taxes) in RUB.
    5. "p90": 90th percentile salary (gross, before taxes) in RUB.
    6. "mrot": Regional subsistence minimum for the working-age population (прожиточный минимум для трудоспособного населения) in RUB.
    7. "popOffset": A small integer (usually between 8 and 15) representing the wealth percentile offset for general population. Default to 12 if unsure.

    Return ONLY a valid JSON array of objects. Do not include markdown or code blocks.
    Structure:
    [
      {"id": "...", "name": "...", "median": 1000, "avg": 1200, "p90": 2000, "mrot": 1500, "popOffset": 12},
      ...
    ]`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }]
    };

    try {
        console.log('Запускаем поиск данных по регионам через Gemini...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const rawText = result.candidates[0].content.parts[0].text;
        const jsonMatch = rawText.match(/\[[\s\S]*?\]/);

        if (jsonMatch) {
            let regions = JSON.parse(jsonMatch[0]);

            // AGENT-2 Verification
            console.log('AGENT-2 (Auditor): Проверка данных по регионам...');
            const auditPrompt = `I received economic data for Russian regions.
            Check if "Чувашская Республика" and "Саратовская область" are included and if their "avg" (average salary) and "mrot" (subsistence minimum) values look realistic for 2024-2026.
            Data for check: ${JSON.stringify(regions.filter(r => r.name.includes("Чуваш") || r.name.includes("Саратов")))}
            Return "VALID" if they look correct or "INVALID" otherwise. ONLY one word.`;

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

            if (auditText.includes("VALID")) {
                fs.writeFileSync('regions.json', JSON.stringify(regions, null, 2));
                console.log(`Успех! База регионов расширена до ${regions.length} записей.`);
            } else {
                console.error('Аудитор отклонил данные. Попробуйте еще раз или проверьте промпт.');
            }
        }
    } catch (error) {
        console.error('Ошибка:', error.message);
    }
}

fetchRegions();
