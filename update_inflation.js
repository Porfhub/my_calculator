const fs = require('fs');

function cleanNum(val, fallbackVal) {
    if (val === undefined || val === null) return fallbackVal;
    const strVal = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    const num = Number(strVal);
    return isNaN(num) ? fallbackVal : num;
}

async function fetchInflation() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.error('Ошибка: DEEPSEEK_API_KEY не обнаружен.');
        process.exit(1);
    }

    const url = 'https://api.deepseek.com/v1/chat/completions';
    
    const promptText = `Provide the official annual inflation rates in Russia (Rosstat) from 2000 to 2025.
    Return ONLY a raw JSON object where keys are years (strings) and values are float numbers. No markdown formatting, no explanations.
    Example structure: {"2000": 20.2, "2001": 18.6}`;

    const fallback = {
        "2000": 20.2, "2001": 18.6, "2002": 15.1, "2003": 12.0, "2004": 11.7,
        "2005": 10.9, "2006": 9.0, "2007": 11.9, "2008": 13.3, "2009": 8.8,
        "2010": 8.8, "2011": 6.1, "2012": 6.6, "2013": 6.5, "2014": 11.4,
        "2015": 12.9, "2016": 5.4, "2017": 2.5, "2018": 4.3, "2019": 3.0,
        "2020": 4.9, "2021": 8.4, "2022": 11.9, "2023": 7.4, "2024": 8.5, "2025": 6.8
    };

    try {
        console.log('Запрашиваем данные об инфляции у DeepSeek...');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: promptText }],
                temperature: 0.1
            })
        });

        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const result = await response.json();
        const rawText = result.choices[0].message.content.trim();
        
        const parsedData = JSON.parse(rawText);
        const finalData = {};

        const currentYear = new Date().getFullYear();
        for (let year = 2000; year <= currentYear; year++) {
            const yearStr = year.toString();
            if (parsedData[yearStr] !== undefined) {
                finalData[yearStr] = cleanNum(parsedData[yearStr], fallback[yearStr] || 6.0);
            } else if (fallback[yearStr]) {
                finalData[yearStr] = fallback[yearStr];
            }
        }

        fs.writeFileSync('inflation.json', JSON.stringify(finalData, null, 2));
        console.log('Успех! Данные об инфляции обновлены через DeepSeek.');

    } catch (error) {
        console.error('Ошибка инфляции DeepSeek, пишем fallback:', error.message);
        fs.writeFileSync('inflation.json', JSON.stringify(fallback, null, 2));
    }
}

fetchInflation();
