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

test('every production calculator has one shared WebWisor methodology block', () => {
    const calculators = [
        'car-vs-taxi.html',
        'financial-freedom.html',
        'genetic-wealth.html',
        'honest-credit.html',
        'inflation-shredder.html',
        'millionaire.html',
        'mortgage.html',
        'rent-vs-mortgage.html',
        'time-is-money.html',
        'wealth.html'
    ];
    const trustLayer = read('js/trust-layer.js');

    for (const file of calculators) {
        const html = read(file);
        assert.match(html, /js\/trust-layer\.js/, `${file}: shared layer`);
        assert.equal((html.match(/data-webwisor=/g) || []).length, 1, `${file}: one block`);
        assert.match(trustLayer, new RegExp(`'${file.replace('.', '\\.')}':\\s*\\{`), `${file}: methodology`);
    }

    for (const label of ['Официальные данные', 'Ваши данные', 'Допущения сценария', 'Расчётный результат', 'Ограничения']) {
        assert.match(trustLayer, new RegExp(label), label);
    }
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
