const fs = require('fs');

async function fetchInflation() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: GEMINI_API_KEY не обнаружен.');
        process.exit(1);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const promptText = `Provide the official annual inflation rates in Russia (Rosstat) from 2000 to 2025. Return ONLY a valid JSON object. No markdown, no codeblocks. Structure: {"2000": 20.2, "2001": 18.6}`;
    const fallback = { "2020": 4.9, "2021": 8.4, "2022": 11.9, "2023": 7.4, "2024": 8.5, "2025": 6.8 };

    try {
        console.log('Запрашиваем данные об инфляции из базы знаний Gemini...');
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
        });

        const result = await response.json();
        
        if (result.error) {
            console.error('ОШИБКА ИНФЛЯЦИИ API:', JSON.stringify(result.error, null, 2));
            throw new Error(result.error.message);
        }

        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Пустой ответ.');

        const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) throw new Error('JSON не найден.');

        fs.writeFileSync('inflation.json', JSON.stringify(JSON.parse(jsonMatch[0]), null, 2));
        console.log('Успех! Данные инфляции успешно сохранены.');

    } catch (error) {
        console.error('Сбой инфляции, применен fallback:', error.message);
        fs.writeFileSync('inflation.json', JSON.stringify(fallback, null, 2));
    }
}

fetchInflation();
