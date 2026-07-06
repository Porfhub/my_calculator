const fs = require('fs');

function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    return isNaN(Number(strVal)) ? fallbackVal : Number(strVal);
}

async function fetchInflation() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен.');
        process.exit(1);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const promptText = `Provide the official annual inflation rates in Russia (Rosstat) from 2000 to 2025.
    Return ONLY a raw JSON object where keys are years (strings) and values are float numbers. No markdown formatting.
    Structure: {"2000": 20.2, "2001": 18.6}`;

    const fallback = { "2020": 4.9, "2021": 8.4, "2022": 11.9, "2023": 7.4, "2024": 8.5, "2025": 6.8 };

    try {
        console.log('Запрашиваем данные об инфляции из базы знаний Gemini (без веб-поиска)...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] }) // БЕЗ TOOLS
        });

        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Пустой ответ.');

        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        const parsedData = JSON.parse(jsonMatch[0]);

        fs.writeFileSync('inflation.json', JSON.stringify(parsedData, null, 2));
        console.log('Успех! Данные инфляции inflation.json успешно сохранены.');

    } catch (error) {
        console.error('Сбой инфляции, применен fallback:', error.message);
        fs.writeFileSync('inflation.json', JSON.stringify(fallback, null, 2));
    }
}

fetchInflation();
