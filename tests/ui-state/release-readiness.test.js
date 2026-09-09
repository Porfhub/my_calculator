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
    assert.match(trustLayer, /Возраст ребёнка, расходы по возрастным этапам/);
    assert.match(homepage, /Введённые значения остаются на вашем устройстве/);
    assert.match(homepage, /Доход, возраст или дата могут потребоваться/);
});

test('key date and mortgage controls have programmatic names', () => {
    const millionaire = read('millionaire.html');
    const mortgage = read('mortgage.html');
    assert.match(millionaire, /label for="birth-date"/);
    assert.match(millionaire, /label for="current-age"/);
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
    assert.match(rent, /Ожидаемая годовая доходность накоплений/);
    assert.match(rent, /Что сильнее всего влияет на этот вывод/);

    assert.match(car, /id="trips-per-month"/);
    assert.match(car, /id="trip-price"/);
    assert.match(car, /includeLostOpportunity: false/);
    assert.match(car, /const annualMileage = tripsPerMonth \* 12 \* taxiTripDistance;/);
    assert.match(car, /const totalCarAnnual = fuelCostAnnual \+ insurance \+ maintenance \+ depreciationAnnual \+ includedOpportunityCost;/);

    assert.match(goal, /name="goal-mode" value="today"/);
    assert.match(goal, /name="goal-mode" value="future" checked/);
    assert.match(goal, /Цель указана в сегодняшних ценах/);
    assert.match(goal, /Цель уже указана в ценах будущего периода/);
    assert.match(goal, /Ожидаемая доходность накоплений/);
    assert.match(goal, /const comparableBalance =/);

    assert.match(income, /id="conversion-summary"/);
    assert.match(income, /Сравнивается как/);
    assert.match(income, /Период: \$\{reference\.source\.reference_period\}/);
});
