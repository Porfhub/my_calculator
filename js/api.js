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
    let response;

    try {
        response = await fetch('inflation.json');
        if (!response.ok) throw new Error('Failed to fetch inflation');
    } catch (error) {
        console.error('Error fetching inflation:', error);
        return createUnavailableInflation('fetch_failed');
    }

    try {
        return normalizeInflationData(await response.json());
    } catch (error) {
        console.error('Error validating inflation:', error);
        return createUnavailableInflation('validation_failed');
    }
}

function createUnavailableInflation(reason) {
    return {
        metadata: {
            schema_version: 2,
            status: 'unavailable',
            source_name: 'Росстат / ЕМИСС',
            source_url: 'https://www.fedstat.ru/indicator/31074',
            source_landing_url: 'https://rosstat.gov.ru/statistics/price',
            source_export_url: null,
            source_checksum_sha256: null,
            indicator_id: '31074',
            showcase_indicator_id: '11521100300010200001',
            indicator_name: 'Индекс потребительских цен на товары и услуги',
            geography: 'Российская Федерация',
            coverage: 'Все товары и услуги',
            measure: 'декабрь к декабрю предыдущего года',
            unit: 'percent',
            frequency: 'annual',
            data_through: null,
            source_published_at: null,
            last_successful_fetch_at: null,
            last_attempt_at: new Date().toISOString(),
            status_reason: reason
        },
        annual: []
    };
}

function normalizeInflationData(data) {
    const metadata = data?.metadata;
    const allowedStatuses = new Set(['ok', 'stale', 'unavailable']);
    const requiredMetadataFields = [
        'schema_version',
        'status',
        'source_name',
        'source_url',
        'source_landing_url',
        'source_export_url',
        'source_checksum_sha256',
        'indicator_id',
        'showcase_indicator_id',
        'indicator_name',
        'geography',
        'coverage',
        'measure',
        'unit',
        'frequency',
        'data_through',
        'source_published_at',
        'last_successful_fetch_at',
        'last_attempt_at',
        'status_reason'
    ];

    if (metadata?.schema_version !== 2 || !allowedStatuses.has(metadata.status) || !Array.isArray(data.annual)) {
        throw new Error('Unsupported inflation schema');
    }
    if (requiredMetadataFields.some((field) => !Object.prototype.hasOwnProperty.call(metadata, field))) {
        throw new Error('Incomplete inflation metadata');
    }

    const requiredStringFields = [
        'source_name',
        'source_url',
        'source_landing_url',
        'indicator_id',
        'showcase_indicator_id',
        'indicator_name',
        'geography',
        'coverage',
        'measure',
        'unit',
        'frequency',
        'last_attempt_at'
    ];
    if (requiredStringFields.some((field) => typeof metadata[field] !== 'string' || metadata[field].trim() === '')) {
        throw new Error('Invalid inflation metadata');
    }

    if (metadata.status === 'unavailable') {
        if (data.annual.length !== 0 || metadata.data_through !== null) {
            throw new Error('Unavailable inflation must not contain data');
        }
        return { metadata: { ...metadata }, annual: [] };
    }

    if (data.annual.length === 0) throw new Error('Inflation data is empty');
    if (
        typeof metadata.source_export_url !== 'string' ||
        typeof metadata.source_checksum_sha256 !== 'string' ||
        typeof metadata.last_successful_fetch_at !== 'string'
    ) {
        throw new Error('Inflation source metadata is incomplete');
    }

    const annual = data.annual.map((entry) => {
        const year = Number(entry.year);
        const cpiIndex = Number(entry.cpi_index);
        const inflationPercent = Number(entry.inflation_percent);

        if (!Number.isInteger(year) || !Number.isFinite(cpiIndex) || !Number.isFinite(inflationPercent)) {
            throw new Error('Invalid inflation record');
        }
        if (Math.abs((cpiIndex - 100) - inflationPercent) > 0.001 || inflationPercent <= -100) {
            throw new Error('Inconsistent inflation record');
        }

        return { year, cpi_index: cpiIndex, inflation_percent: inflationPercent };
    }).sort((a, b) => a.year - b.year);

    for (let i = 1; i < annual.length; i++) {
        if (annual[i].year !== annual[i - 1].year + 1) {
            throw new Error('Inflation years must be unique and consecutive');
        }
    }

    if (Number(metadata.data_through) !== annual[annual.length - 1].year) {
        throw new Error('Inflation metadata does not match annual data');
    }

    return { metadata: { ...metadata }, annual };
}

function getInflationByYear(data) {
    if (!data || data.metadata?.status === 'unavailable') return {};
    return Object.fromEntries(data.annual.map((entry) => [entry.year, entry.inflation_percent]));
}

function getAverageInflationRate(data, years = 15) {
    if (!data || data.metadata?.status === 'unavailable' || !Number.isInteger(years) || years <= 0) return null;

    const values = data.annual.slice(-years).map((entry) => entry.inflation_percent);
    if (values.length === 0) return null;

    const product = values.reduce((acc, rate) => acc * (1 + rate / 100), 1);
    return Math.pow(product, 1 / values.length) - 1;
}

function getInflationStatusMessage(data) {
    if (data?.metadata?.status === 'stale') {
        const dataThrough = data.metadata.data_through;
        return dataThrough
            ? `Данные инфляции временно не обновляются. Используются последние доступные данные по ${dataThrough} год.`
            : 'Данные инфляции временно не обновляются. Используются последние доступные данные.';
    }

    if (data?.metadata?.status === 'unavailable') {
        return 'Данные инфляции временно недоступны. Расчёт с инфляцией не выполнен.';
    }

    return null;
}
