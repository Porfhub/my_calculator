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
        return normalizeInflationData(await response.json());
    } catch (error) {
        console.error('Error loading inflation:', error);
        return null;
    }
}

function isOfficialInflationUrl(value) {
    if (typeof value !== 'string' || value.trim() === '') return false;

    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        return url.protocol === 'https:' && (hostname === 'fedstat.ru'
            || hostname.endsWith('.fedstat.ru')
            || hostname === 'rosstat.gov.ru'
            || hostname.endsWith('.rosstat.gov.ru'));
    } catch {
        return false;
    }
}

function normalizeInflationData(dataset) {
    const metadata = dataset?.metadata;
    const status = getDatasetStatus(dataset);

    if (metadata?.schema_version !== 2 || !Array.isArray(dataset?.annual)) {
        throw new Error('Unsupported inflation schema');
    }
    if (
        metadata.indicator_id !== '31074'
        || metadata.geography !== 'Российская Федерация'
        || metadata.measure !== 'декабрь к декабрю предыдущего года'
        || metadata.unit !== 'percent'
        || metadata.frequency !== 'annual'
        || !isOfficialInflationUrl(metadata.source_url)
        || !isOfficialInflationUrl(metadata.source_landing_url)
    ) {
        throw new Error('Unsupported inflation source');
    }

    if (status === 'unavailable') {
        if (
            metadata.status !== 'unavailable'
            || dataset.annual.length !== 0
            || metadata.data_through !== null
            || metadata.source_export_url !== null
            || metadata.source_checksum_sha256 !== null
            || metadata.source_published_at !== null
            || metadata.last_successful_fetch_at !== null
        ) {
            throw new Error('Invalid unavailable inflation dataset');
        }
        return { metadata: { ...metadata }, annual: [] };
    }

    if (!isDatasetUsable(dataset) || dataset.annual.length === 0) {
        throw new Error('Inflation data is unavailable');
    }
    if (
        !isOfficialInflationUrl(metadata.source_export_url)
        || typeof metadata.source_checksum_sha256 !== 'string'
        || !/^[a-f0-9]{64}$/i.test(metadata.source_checksum_sha256)
        || typeof metadata.source_published_at !== 'string'
        || typeof metadata.last_successful_fetch_at !== 'string'
    ) {
        throw new Error('Inflation provenance is incomplete');
    }

    const annual = dataset.annual.map((entry) => {
        const year = entry?.year;
        const cpiIndex = entry?.cpi_index;
        const inflationPercent = entry?.inflation_percent;

        if (!Number.isInteger(year) || !Number.isFinite(cpiIndex) || !Number.isFinite(inflationPercent)) {
            throw new Error('Invalid inflation record');
        }
        if (cpiIndex <= 0 || inflationPercent <= -100 || Math.abs(inflationPercent - (cpiIndex - 100)) > 1e-6) {
            throw new Error('Inconsistent inflation record');
        }

        return { year, cpi_index: cpiIndex, inflation_percent: inflationPercent };
    }).sort((left, right) => left.year - right.year);

    if (annual[0].year !== 2000) throw new Error('Inflation history is incomplete');
    for (let index = 1; index < annual.length; index += 1) {
        if (annual[index].year !== annual[index - 1].year + 1) {
            throw new Error('Inflation years must be unique and consecutive');
        }
    }
    if (!Number.isInteger(metadata.data_through) || metadata.data_through !== annual[annual.length - 1].year) {
        throw new Error('Inflation metadata does not match annual data');
    }

    return { metadata: { ...metadata }, annual };
}

function getInflationRecords(dataset) {
    try {
        const normalized = normalizeInflationData(dataset);
        return normalized.metadata.status === 'unavailable' ? [] : normalized.annual;
    } catch {
        return [];
    }
}

function getInflationStatusMessage(dataset) {
    const status = getDatasetStatus(dataset);
    if (status === 'stale') {
        const dataThrough = Number(dataset?.metadata?.data_through);
        return Number.isInteger(dataThrough)
            ? `Используются последние доступные официальные данные по ${dataThrough} год.`
            : 'Используются последние доступные официальные данные.';
    }
    if (status === 'unavailable') {
        return 'Данные инфляции временно недоступны. Расчёт не выполнен.';
    }
    return null;
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

function getCombinedDatasetStatus(datasets) {
    if (!Array.isArray(datasets) || datasets.length === 0) return 'unavailable';

    const statuses = datasets.map(getDatasetStatus);
    if (statuses.includes('unavailable')) return 'unavailable';
    return statuses.includes('stale') ? 'stale' : 'ok';
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

    const records = getInflationRecords(dataset);
    const values = records.slice(-years).map((entry) => entry.inflation_percent);

    if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= -100)) return null;

    const product = values.reduce((acc, rate) => acc * (1 + rate / 100), 1);
    const average = Math.pow(product, 1 / values.length) - 1;
    return Number.isFinite(average) ? average : null;
}

if (typeof module === 'object' && module.exports) {
    module.exports = {
        fetchInflation,
        getAverageInflationRate,
        getCentralBankRate,
        getCombinedDatasetStatus,
        getDatasetStatus,
        getInflationRecords,
        getInflationStatusMessage,
        normalizeInflationData,
        isDatasetUsable
    };
}
