/*
 * Pure, source-agnostic helpers for the Income X-Ray reference comparison.
 * They deliberately compare a salary with published reference values only.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.IncomeComparison = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    function normalizeDataset(dataset) {
        if (!dataset || !dataset.metadata || !Array.isArray(dataset.regions)) return null;
        return dataset;
    }

    function getRegion(dataset, regionId) {
        return dataset?.regions?.find((region) => region.id === regionId) || null;
    }

    function compareSalary(salary, reference) {
        if (!Number.isFinite(salary) || salary <= 0 || !Number.isFinite(reference) || reference <= 0) return null;
        const difference = salary - reference;
        const percent = Math.round(Math.abs(difference) / reference * 100);
        return {
            difference,
            percent,
            relation: difference === 0 ? 'equal' : difference > 0 ? 'above' : 'below'
        };
    }

    function availableReferences(region) {
        const references = [
            { key: 'median_salary', title: 'Медианная зарплата', value: region?.metrics?.median_salary?.value || null },
            { key: 'average_salary', title: 'Средняя зарплата', value: region?.metrics?.average_salary?.value || null },
            { key: 'high_income_reference', title: 'Уровень высоких зарплат', value: region?.metrics?.high_income_reference?.value || null }
        ];
        return references.filter((reference) => Number.isFinite(reference.value) && reference.value > 0);
    }

    return { normalizeDataset, getRegion, compareSalary, availableReferences };
}));
