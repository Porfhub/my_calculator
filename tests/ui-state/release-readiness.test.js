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
