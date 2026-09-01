const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('homepage avoids unsupported trust claims and explains the product boundary', () => {
    const homepage = read('index.html');

    assert.match(homepage, /Сценарии, а не рекомендации/);
    assert.match(homepage, /Банка России и Росстата/);
    assert.doesNotMatch(homepage, /миллионы пользователей/i);
    assert.doesNotMatch(homepage, /100%\s*Конфиденциально/i);
    assert.doesNotMatch(homepage, /Абсолютно независим/i);
});

test('official-data consumers show a human-readable source without technical jargon', () => {
    assert.match(read('financial-freedom.html'), /Источники сценария: ключевая ставка Банка России и годовой ряд инфляции Росстата/);
    assert.match(read('millionaire.html'), /Источники сценария: ключевая ставка Банка России и годовой ряд инфляции Росстата/);
    assert.match(read('genetic-wealth.html'), /Источник инфляции: годовой ряд Росстата/);
    assert.match(read('inflation-shredder.html'), /Источник: Росстат \/ ЕМИСС, годовой ряд/);
});

test('calculator copy does not retain prototype labels or manipulative prompts', () => {
    const copy = [
        'index.html',
        'honest-credit.html',
        'mortgage.html',
        'wealth.html',
        'genetic-wealth.html',
        'inflation-shredder.html'
    ].map(read).join('\n');

    for (const phrase of [
        'ИпотекаПро',
        'Рентген Доходов',
        'Генетическое богатство',
        'Шредер Рубля',
        '**PRO версии**',
        'грабительские',
        'шокирующие'
    ]) {
        const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.doesNotMatch(copy, new RegExp(escapedPhrase, 'i'), phrase);
    }
    assert.doesNotMatch(copy, /(?:^|\s)Срочно(?:[!.,]|\s)/i);
});
