const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const comparison = require(path.join(root, 'js', 'income-comparison.js'));
const regions = JSON.parse(fs.readFileSync(path.join(root, 'regions.json'), 'utf8'));
const wealth = fs.readFileSync(path.join(root, 'wealth.html'), 'utf8');

test('comparison percentages use only a direct salary/reference difference', () => {
    assert.deepEqual(comparison.compareSalary(120000, 100000), { difference: 20000, percent: 20, relation: 'above' });
    assert.deepEqual(comparison.compareSalary(75000, 100000), { difference: -25000, percent: 25, relation: 'below' });
    assert.deepEqual(comparison.compareSalary(100000, 100000), { difference: 0, percent: 0, relation: 'equal' });
});

test('official region dataset includes Russia and the full 89-subject roster', () => {
    assert.equal(regions.regions.length, 90);
    assert.equal(new Set(regions.regions.map((region) => region.id)).size, 90);
    assert.equal(comparison.getRegion(regions, 'RU').name, 'Россия');
    assert.equal(comparison.getRegion(regions, 'MSK').name, 'Москва');
    assert.equal(regions.metadata.source_name, 'Росстат');
    assert.match(regions.metadata.updated_at, /^\d{4}-\d{2}-\d{2}$/);
});

test('Russia mode exposes only the verified national salary references', () => {
    const references = comparison.availableReferences(comparison.getRegion(regions, 'RU'));
    assert.deepEqual(references.map((reference) => [reference.key, reference.value]), [
        ['median_salary', 73871],
        ['average_salary', 99399]
    ]);
});

test('income x-ray contains no ranking or social-class model', () => {
    assert.doesNotMatch(wealth, /percentile|богаче|Топ-|Финансовая элита|Крайняя бедность/i);
    assert.doesNotMatch(wealth, /popOffset|renderSocialStrata|calculateWealth/);
    assert.match(wealth, /IncomeComparison\.compareSalary/);
});

test('minimum-income tooltip identifies the subsistence minimum and rejects MROT equivalence', () => {
    assert.match(wealth, /Прожиточный минимум трудоспособного населения/);
    assert.match(wealth, /не является законодательно установленным минимальным размером оплаты труда/);
    assert.match(wealth, /aria-describedby="minimumInfo"/);
});
