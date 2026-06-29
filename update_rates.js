const fs = require('fs');

async function fetchRates() {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const promptText = `Найди актуальную ключевую ставку ЦБ РФ и средние базовые ставки по коммерческой ипотеке в банках: Сбербанк, ВТБ, Альфа-Банк, Т-Банк, Совкомбанк. Верни строго JSON: {"cb_rate": 0, "sberbank": 0, "vtb": 0, "alfa": 0, "tbank": 0, "sovcom": 0}`;

    const payload = {
        contents: [{ parts: [{ text: promptText }] }],
        tools: [{ "google_search": {} }],
        generationConfig: { responseMimeType: "application/json" }
    };

    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        const dataText = result.candidates[0].content.parts[0].text;
        
        // Записываем результат в файл rates.json
        fs.writeFileSync('rates.json', dataText);
        console.log('Ставки успешно обновлены!');
    } catch (error) {
        console.error('Ошибка:', error);
        process.exit(1); // Останавливаем процесс с ошибкой
    }
}

fetchRates();
