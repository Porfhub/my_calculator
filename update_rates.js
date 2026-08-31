const fs = require('fs');
const path = require('path');

const API_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx';
const SOURCE_URL = 'https://www.cbr.ru/DailyInfoWebServ/DailyInfo.asmx?op=KeyRateXML';
const RATES_PATH = path.join(__dirname, 'rates.json');
const KEY_RATE_HISTORY_START = '2013-09-01';

function parseKeyRateXml(xmlText) {
    const entries = [];
    const entryPattern = /<KR>\s*<DT>([^<]+)<\/DT>\s*<Rate>([^<]+)<\/Rate>\s*<\/KR>/g;
    let match;

    while ((match = entryPattern.exec(xmlText)) !== null) {
        const effectiveDate = match[1].slice(0, 10);
        const rate = Number(match[2].replace(',', '.'));

        if (/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && Number.isFinite(rate) && rate > 0) {
            entries.push({ effectiveDate, rate });
        }
    }

    if (entries.length === 0) {
        throw new Error('Ответ Банка России не содержит данных ключевой ставки');
    }

    entries.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    const latest = entries[0];
    let effectiveFrom = latest.effectiveDate;

    for (const entry of entries) {
        if (entry.rate !== latest.rate) break;
        effectiveFrom = entry.effectiveDate;
    }

    return {
        cb_rate: latest.rate,
        effective_from: effectiveFrom
    };
}

function readSavedRates(ratesPath = RATES_PATH) {
    try {
        return JSON.parse(fs.readFileSync(ratesPath, 'utf8'));
    } catch (error) {
        return null;
    }
}

function hasSavedOfficialRate(data) {
    return Boolean(
        data &&
        Number.isFinite(Number(data.cb_rate)) &&
        Number(data.cb_rate) > 0 &&
        data.source_url &&
        data.effective_from &&
        data.fetched_at &&
        (data.status === 'ok' || data.status === 'stale')
    );
}

function buildSoapRequest(toDate) {
    return [
        '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
        '<soap:Body>',
        '<KeyRateXML xmlns="http://web.cbr.ru/">',
        `<fromDate>${KEY_RATE_HISTORY_START}</fromDate>`,
        `<ToDate>${toDate}</ToDate>`,
        '</KeyRateXML>',
        '</soap:Body>',
        '</soap:Envelope>'
    ].join('');
}

async function fetchOfficialRate(fetchImpl = fetch, now = new Date()) {
    const toDate = now.toISOString().slice(0, 10);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetchImpl(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: 'http://web.cbr.ru/KeyRateXML',
                'User-Agent': 'CalcHub rates updater'
            },
            body: buildSoapRequest(toDate),
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`Банк России вернул HTTP ${response.status}`);
        }

        return parseKeyRateXml(await response.text());
    } finally {
        clearTimeout(timeoutId);
    }
}

async function buildRatesData(options = {}) {
    const now = options.now || new Date();
    const previousData = options.previousData === undefined
        ? readSavedRates(options.ratesPath)
        : options.previousData;

    try {
        const officialRate = await fetchOfficialRate(options.fetchImpl || fetch, now);
        return {
            cb_rate: officialRate.cb_rate,
            source_url: SOURCE_URL,
            effective_from: officialRate.effective_from,
            fetched_at: now.toISOString(),
            status: 'ok'
        };
    } catch (error) {
        console.error('Не удалось получить актуальную ключевую ставку:', error.message);

        if (hasSavedOfficialRate(previousData)) {
            return {
                cb_rate: Number(previousData.cb_rate),
                source_url: previousData.source_url,
                effective_from: previousData.effective_from,
                fetched_at: previousData.fetched_at,
                status: 'stale'
            };
        }

        return {
            cb_rate: null,
            source_url: SOURCE_URL,
            effective_from: null,
            fetched_at: null,
            status: 'unavailable'
        };
    }
}

async function updateRates() {
    const finalData = await buildRatesData({ ratesPath: RATES_PATH });
    fs.writeFileSync(RATES_PATH, `${JSON.stringify(finalData, null, 2)}\n`);
    console.log('rates.json обновлен:', finalData);
}

if (require.main === module) {
    updateRates().catch(error => {
        console.error('Не удалось обновить rates.json:', error);
        process.exitCode = 1;
    });
}

module.exports = {
    SOURCE_URL,
    buildRatesData,
    parseKeyRateXml
};
