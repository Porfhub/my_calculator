const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
    assert.match(read('millionaire.html'), /link\('Банка России', rate.source\)/);
    assert.match(read('millionaire.html'), /rateDate.format\(rate.effective\)/);
    assert.match(read('millionaire.html'), /link\('Источник Росстат \/ ЕМИСС', inflation.source\)/);
    assert.match(read('genetic-wealth.html'), /Источник инфляции: годовой ряд Росстата/);
    assert.match(read('inflation-shredder.html'), /Источник: Росстат \/ ЕМИСС, годовой ряд/);
});

test('every production calculator has one methodology block', () => {
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
        if (file === 'car-vs-taxi.html') {
            assert.equal((html.match(/<details id="ct-methodology"[^>]*>/g) || []).length, 1);
            assert.doesNotMatch(html, /data-webwisor=|js\/trust-layer\.js/);
            assert.match(html, /длина поездки из блока «Условия поездок»/);
            assert.match(html, /например парковку, налог и шины/);
            continue;
        }
        if (file === 'honest-credit.html') {
            assert.equal((html.match(/<summary>Как посчитано<\/summary>/g) || []).length, 1);
            assert.match(html, /https:\/\/www\.cbr\.ru\/explan\/359-fz\//);
            assert.doesNotMatch(html, /data-webwisor=/);
            continue;
        }
        if (file === 'millionaire.html') {
            assert.equal((html.match(/<summary>Как посчитано<\/summary>/g) || []).length, 1);
            assert.match(html, /Историческое среднее не является прогнозом/);
            assert.match(html, /Ключевая ставка Банка России приведена для справки/);
            continue;
        }
        assert.match(html, /js\/trust-layer\.js/, `${file}: shared layer`);
        assert.equal((html.match(/data-webwisor=/g) || []).length, 1, `${file}: one block`);
        assert.match(trustLayer, new RegExp(`'${file.replace('.', '\\.')}':\\s*\\{`), `${file}: methodology`);
    }

    for (const label of ['Официальные данные', 'Ваши данные', 'Допущения сценария', 'Расчётный результат', 'Ограничения']) {
        assert.match(trustLayer, new RegExp(label), label);
    }

    assert.match(trustLayer, /ℹ️ Как устроен расчёт/);
    assert.doesNotMatch(trustLayer, /<summary>[^\n]*WebWisor/);
});

test('shared trust layer uses the compact disclosure only on the opted-in pages', () => {
    const compact = new Set(['financial-freedom', 'genetic-wealth', 'inflation-shredder', 'wealth']);
    const script = read('js/trust-layer.js');
    const rendered = new Map();

    for (const page of [...compact, 'mortgage', 'rent-vs-mortgage', 'time-is-money', 'honest-credit', 'millionaire']) {
        const html = read(`${page}.html`);
        const host = html.match(/<[^>]*data-webwisor="[^"]+"[^>]*>/)?.[0];
        const variant = host?.match(/data-webwisor-variant="([^"]+)"/)?.[1];
        assert.equal(variant, compact.has(page) ? 'compact' : undefined, page);
        if (compact.has(page)) assert.match(host, /class="[^"]*\byn-scope\b/, page);

        const container = {
            dataset: {
                webwisor: page,
                webwisorVariant: variant,
                webwisorRendered: host?.includes('data-webwisor-rendered="true"') ? 'true' : undefined
            },
            innerHTML: 'original'
        };
        const document = {
            readyState: 'complete',
            head: { appendChild() {} },
            createElement: () => ({}),
            querySelectorAll: () => host ? [container] : []
        };
        vm.runInNewContext(script, { document, window: { location: { pathname: `/${page}.html` } } });
        rendered.set(page, container.innerHTML);

        if (compact.has(page)) {
            assert.match(container.innerHTML, /<details class="yn-methodology"[^>]*>\s*<summary class="yn-methodology-summary">Как устроен расчёт<\/summary>/);
            assert.equal((container.innerHTML.match(/class="yn-methodology-group"/g) || []).length, 4);
            assert.doesNotMatch(container.innerHTML, /<dl>|\bopen\b/);
        } else if (page === 'mortgage') {
            assert.match(container.innerHTML, /<details class="webwisor"/);
            assert.doesNotMatch(container.innerHTML, /yn-methodology/);
        } else {
            assert.equal(container.innerHTML, 'original');
        }
    }

    assert.doesNotMatch(read('genetic-wealth.html'), /Методология расчетов|id="inflation-val-text"/);
    assert.match(rendered.get('genetic-wealth'), /<span id="inflation-val-text" hidden>/);
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
