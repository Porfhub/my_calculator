const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('mortgage shows the complete calculated schedule without test-code or unfinished-feature artifacts', () => {
    const mortgage = read('mortgage.html');
    assert.doesNotMatch(mortgage, /isProUnlocked|checkProPassword|pro-password|тестовый код|Спецкод|на переработке|временно отключён/i);
    assert.match(mortgage, /sortedYears\.forEach\(yNum => \{/);
    assert.match(mortgage, /yData\.forEach\(m => \{/);
});

test('methodology and privacy copy match actual local calculator inputs', () => {
    const trustLayer = read('js/trust-layer.js');
    const homepage = read('index.html');
    assert.doesNotMatch(trustLayer, /Город, возраст ребёнка/);
    assert.match(trustLayer, /Месячный бюджет каждого этапа и выбранные условия семьи/);
    assert.match(homepage, /Введённые значения остаются на вашем устройстве/);
    assert.match(homepage, /Доход, возраст или дата могут потребоваться/);
});

test('financial-goal and mortgage controls have programmatic names', () => {
    const millionaire = read('millionaire.html');
    const mortgage = read('mortgage.html');
    for (const id of ['goal-sum', 'current-savings', 'monthly-contribution']) {
        assert.ok(millionaire.includes('<label for="' + id + '">'));
    }
    assert.match(mortgage, /aria-label="Учитывать ипотечную страховку"/);
    assert.match(mortgage, /aria-label="Осталось платить: лет"/);
});

test('release audit scenarios keep their units, transport need and source context explicit', () => {
    const rent = read('rent-vs-mortgage.html');
    const car = read('car-vs-taxi.html');
    const goal = read('millionaire.html');
    const income = read('wealth.html');

    assert.match(rent, /id="include-investments"/);
    assert.match(rent, /includeInvestments: false/);
    assert.match(rent, /Доходность в год/);
    assert.match(rent, /Как считаем и что учитываем/);
    assert.match(rent, /id="ledger-deposit"/);
    assert.doesNotMatch(rent, /tab-btn-(buy|rent)|tab-content-(buy|rent)/);
    assert.match(rent, /Допущения расчёта/);

    assert.match(car, /id="trips-per-month"/);
    assert.match(car, /id="trip-price"/);
    assert.match(car, /<details id="capital-scenario"/);
    assert.doesNotMatch(car, /<input id="opportunity-rate"[^>]*(?:value|placeholder)=/);
    assert.match(car, /'taxi-trip-distance': \{ key: 'taxiTripDistance', max: 10000, positive: true/);
    assert.match(car, /const annualMileage = tripsPerMonth \* 12 \* taxiTripDistance;/);
    assert.match(car, /const totalCarAnnual = carCashAnnual \+ depreciationAnnual;/);

    assert.match(goal, /name="goal-mode" value="today"/);
    assert.match(goal, /name="goal-mode" value="fixed" checked/);
    assert.match(goal, /Цель сохраняет покупательную способность указанной суммы в сегодняшних ценах/);
    assert.match(goal, /Целевая сумма в рублях остаётся постоянной/);
    assert.match(goal, /<legend>Доходность накоплений<\/legend>/);
    assert.match(goal, /Каждый новый взнос добавляется в конце месяца и начинает приносить доход со следующего/);
    assert.match(goal, /name="return-mode" value="zero" checked/);
    assert.match(goal, /Капитал в сегодняшних рублях/);
    assert.match(goal, /Порог в сегодняшних рублях/);

    assert.match(income, /id="conversion-summary"/);
    assert.match(income, /Сравнивается как/);
    assert.match(income, /Период: \$\{reference\.source\.reference_period\}/);
});

test('child-cost framing remains neutral and primary controls receive programmatic labels', () => {
    const childCost = read('genetic-wealth.html');
    const utilities = read('js/ui-utils.js');

    assert.doesNotMatch(childCost, /подъемн|высокодоходн|счастливое детство/i);
    assert.match(childCost, /Расходы распределены на 18 лет/);
    assert.match(utilities, /function applyAccessibleControlLabels\(\)/);
    assert.match(utilities, /'mode-checkbox': 'Экспертный режим'/);
    assert.match(utilities, /'interest-rate': 'Ожидаемая годовая доходность, % в год'/);
});
