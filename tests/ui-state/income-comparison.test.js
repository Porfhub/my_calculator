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
    const references = comparison.availableReferences(comparison.getRegion(regions, 'RU'), regions.sources);
    assert.deepEqual(references.map((reference) => [reference.key, reference.value]), [
        ['median_salary', 73871],
        ['average_salary', 99399],
        ['working_age_subsistence_minimum', 20644]
    ]);
});

test('a partial regional record keeps its verified comparison instead of failing the whole result', () => {
    const moscow = comparison.availableReferences(comparison.getRegion(regions, 'MSK'), regions.sources);
    assert.deepEqual(moscow.map((reference) => [reference.key, reference.value]), [['average_salary', 180861]]);
    assert.equal(comparison.availableReferences(comparison.getRegion(regions, 'ADY'), regions.sources).length, 0);
});

test('selector eligibility requires at least one verified official comparison metric', () => {
    const eligibleIds = regions.regions
        .filter((region) => comparison.availableReferences(region, regions.sources).length > 0)
        .map((region) => region.id);
    assert.ok(eligibleIds.includes('RU'));
    assert.ok(eligibleIds.includes('MSK'));
    assert.ok(!eligibleIds.includes('ADY'));
});

test('only metrics with a declared official source are available for comparison', () => {
    const region = { id: 'TEST', name: 'Тест', metrics: { average_salary: { value: 100000, source_id: 'missing' } } };
    assert.equal(comparison.availableReferences(region, regions.sources).length, 0);
});

test('dataset normalization preserves valid regional records when another record is malformed', () => {
    const dataset = comparison.normalizeDataset({
        sources: { official: { url: 'https://rosstat.gov.ru/example' } },
        regions: [
            { id: 'RU', name: 'Россия', metrics: { average_salary: { value: 100000, source_id: 'official' } } },
            { id: '', name: 'Повреждённая запись' }
        ]
    });
    assert.equal(dataset.regions.length, 1);
    assert.deepEqual(
        comparison.availableReferences(comparison.getRegion(dataset, 'RU'), dataset.sources).map((reference) => reference.key),
        ['average_salary']
    );
});

test('income x-ray contains no ranking or social-class model', () => {
    assert.doesNotMatch(wealth, /percentile|богаче|Топ-|Финансовая элита|Крайняя бедность/i);
    assert.doesNotMatch(wealth, /popOffset|renderSocialStrata|calculateWealth/);
    assert.match(wealth, /IncomeComparison\.compareSalary/);
});

test('the unavailable state is reserved for a region with no verified references', () => {
    assert.match(wealth, /references\.length \? references\.map/);
    assert.match(wealth, /references\.length \? 'Средняя зарплата/);
    assert.match(wealth, /Данные недоступны: нет официальных ориентиров/);
});

test('main result shows one direct comparison as a consistent ruble difference and percentage', () => {
    const result = comparison.compareSalary(120000, 100000);
    assert.equal(result.difference, 20000);
    assert.equal(result.percent, 20);
    assert.match(wealth, /formatMoney\(Math\.abs\(comparison\.difference\)\)/);
    assert.match(wealth, /\$\{sign\}\$\{comparison\.percent\}%/);
});

test('page loads the full selector from the validated dataset and resolves the dataset URL from its deployment path', () => {
    const api = fs.readFileSync(path.join(root, 'js', 'api.js'), 'utf8');
    assert.match(wealth, /selectableRegions\.forEach/);
    assert.match(api, /new URL\('regions\.json', document\.baseURI\)/);
});

test('minimum-income tooltip identifies the subsistence minimum and rejects MROT equivalence', () => {
    assert.match(wealth, /Прожиточный минимум трудоспособного населения/);
    assert.match(wealth, /не является законодательно установленным минимальным размером оплаты труда/);
    assert.match(wealth, /aria-describedby="minimumInfo"/);
});
