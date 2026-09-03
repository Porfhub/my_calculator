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
        if (!dataset || !Array.isArray(dataset.regions)) return null;

        // A malformed entry must not make verified entries in other regions
        // disappear.  Each metric is checked again before it is displayed.
        const regions = dataset.regions.filter((region) => (
            region
            && typeof region.id === 'string'
            && region.id.trim() !== ''
            && typeof region.name === 'string'
            && region.name.trim() !== ''
        ));
        if (regions.length === 0) return null;

        return {
            metadata: dataset.metadata && typeof dataset.metadata === 'object' ? dataset.metadata : {},
            sources: dataset.sources && typeof dataset.sources === 'object' ? dataset.sources : {},
            regions
        };
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

    function isVerifiedMetric(metric, sources) {
        if (!metric || !Number.isFinite(metric.value) || metric.value <= 0) return false;
        const source = sources?.[metric.source_id];
        return Boolean(
            typeof metric.source_id === 'string'
            && source
            && typeof source.url === 'string'
            && source.url.startsWith('https://')
        );
    }

    function availableReferences(region, sources = {}) {
        const references = [
            { key: 'median_salary', title: 'Медианная зарплата', metric: region?.metrics?.median_salary },
            { key: 'average_salary', title: 'Средняя зарплата', metric: region?.metrics?.average_salary },
            { key: 'working_age_subsistence_minimum', title: 'Прожиточный минимум трудоспособного населения', metric: region?.metrics?.working_age_subsistence_minimum }
        ];
        return references
            .filter((reference) => isVerifiedMetric(reference.metric, sources))
            .map((reference) => ({ ...reference, value: reference.metric.value }));
    }

    return { normalizeDataset, getRegion, compareSalary, isVerifiedMetric, availableReferences };
}));
