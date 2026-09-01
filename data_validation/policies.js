'use strict';

const path = require('path');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const STATUS_REASONS = new Set([
    'fetch_failed',
    'timeout',
    'http_error',
    'tls_error',
    'source_format_changed',
    'schema_validation_failed',
    'semantic_validation_failed',
    'freshness_exceeded',
    'jump_requires_review',
    'partial_dataset',
    'no_saved_dataset'
]);

const DATASET_POLICIES = Object.freeze({
    rates: Object.freeze({
        datasetId: 'key_rate',
        schemaVersion: 2,
        schemaPath: path.join(__dirname, '..', 'schemas', 'rates.schema.json'),
        dataPath: path.join(__dirname, '..', 'rates.json'),
        sourceHosts: Object.freeze(['www.cbr.ru', 'cbr.ru']),
        sourceUrl: 'https://www.cbr.ru/hd_base/keyrate/',
        sourceExportUrl: 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx',
        softTtlMs: 72 * HOUR_MS,
        hardTtlMs: 7 * DAY_MS,
        hardRange: Object.freeze({ min: 0, max: 100 }),
        maxDecimalPlaces: 4,
        absoluteJumpPercentagePoints: 5,
        relativeJumpRatio: 0.5,
        clockSkewMs: HOUR_MS
    }),
    inflation: Object.freeze({
        datasetId: 'inflation_annual',
        schemaVersion: 2,
        schemaPath: path.join(__dirname, '..', 'schemas', 'inflation.schema.json'),
        dataPath: path.join(__dirname, '..', 'inflation.json'),
        sourceHosts: Object.freeze(['www.fedstat.ru', 'fedstat.ru', 'rosstat.gov.ru', 'www.rosstat.gov.ru', 'ssl.rosstat.gov.ru']),
        sourceUrl: 'https://www.fedstat.ru/indicator/31074',
        sourceLandingUrl: 'https://rosstat.gov.ru/statistics/price',
        publicationScheduleUrl: 'https://rosstat.gov.ru/compendium/document/50798',
        minYear: 2000,
        // Росстат scheduled the December 2025 CPI release for 2026-01-16.
        // January 31 is a conservative version-controlled publication grace boundary.
        completedYearPublicationMonth: 1,
        completedYearPublicationDay: 31,
        missingYearHardTtlMs: 90 * DAY_MS,
        historicalRevisionThreshold: 0.5,
        interYearJumpThreshold: 15,
        clockSkewMs: HOUR_MS
    })
});

function getPolicy(dataset) {
    const policy = DATASET_POLICIES[dataset];
    if (!policy) throw new Error(`Неизвестный набор данных: ${dataset}`);
    return policy;
}

module.exports = {
    DATASET_POLICIES,
    STATUS_REASONS,
    getPolicy
};
