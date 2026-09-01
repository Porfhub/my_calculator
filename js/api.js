/**
 * API service for fetching financial data.
 */

async function fetchRegions() {
    try {
        const response = await fetch('regions.json');
        if (!response.ok) throw new Error('Failed to fetch regions');
        return await response.json();
    } catch (error) {
        console.error('Error loading regions:', error);
        return [];
    }
}

async function fetchRates() {
    try {
        const response = await fetch('rates.json');
        if (!response.ok) throw new Error('Failed to fetch rates');
        return await response.json();
    } catch (error) {
        console.error('Error loading rates:', error);
        return null;
    }
}

async function fetchInflation() {
    try {
        const response = await fetch('inflation.json');
        if (!response.ok) throw new Error('Failed to fetch inflation');
        return await response.json();
    } catch (error) {
        console.error('Error loading inflation:', error);
        return null;
    }
}

function getDatasetStatus(dataset) {
    const allowedStatuses = new Set(['ok', 'stale', 'unavailable']);
    const metadataStatus = dataset?.metadata?.status;
    const topLevelStatus = dataset?.status;

    if (dataset?.metadata) {
        if (!allowedStatuses.has(metadataStatus)) return 'unavailable';
        if (topLevelStatus !== undefined && topLevelStatus !== metadataStatus) return 'unavailable';
        return metadataStatus;
    }

    if (topLevelStatus !== undefined) {
        return allowedStatuses.has(topLevelStatus) ? topLevelStatus : 'unavailable';
    }

    return dataset ? 'ok' : 'unavailable';
}

function isDatasetUsable(dataset) {
    const status = getDatasetStatus(dataset);
    return Boolean(dataset) && (status === 'ok' || status === 'stale');
}

function getCentralBankRate(dataset) {
    if (!isDatasetUsable(dataset)) return null;

    const rawValue = dataset?.key_rate?.value_percent ?? dataset?.cb_rate;
    if (rawValue === null || rawValue === undefined || rawValue === '') return null;
    const value = Number(rawValue);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function getAverageInflationRate(dataset, years = 15) {
    if (!isDatasetUsable(dataset) || !Number.isInteger(years) || years <= 0) return null;

    let values;
    if (Array.isArray(dataset.annual)) {
        values = dataset.annual.slice(-years).map((entry) => {
            const rawValue = entry?.inflation_percent;
            return rawValue === null || rawValue === undefined || rawValue === '' ? NaN : Number(rawValue);
        });
    } else {
        values = Object.entries(dataset)
            .filter(([year]) => /^\d{4}$/.test(year))
            .sort(([left], [right]) => Number(left) - Number(right))
            .slice(-years)
            .map(([, value]) => Number(value));
    }

    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= -100)) return null;

    const product = values.reduce((acc, rate) => acc * (1 + rate / 100), 1);
    const average = Math.pow(product, 1 / values.length) - 1;
    return Number.isFinite(average) ? average : null;
}

if (typeof module === 'object' && module.exports) {
    module.exports = {
        getAverageInflationRate,
        getCentralBankRate,
        getDatasetStatus,
        isDatasetUsable
    };
}
