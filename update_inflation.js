const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const OUTPUT_PATH = path.join(__dirname, 'inflation.json');
const SOURCE_LANDING_URL = 'https://rosstat.gov.ru/statistics/price';
const SOURCE_URL = 'https://www.fedstat.ru/indicator/31074';
const SOURCE_DOCUMENT_TITLE =
    'Индексы потребительских цен на товары и услуги по Российской Федерации, месяцы (с 1991 г.)';
const MIN_YEAR = 2000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

// Росстат использует российскую государственную цепочку доверия. Сертификаты
// опубликованы Минцифры; hostname и вся TLS-цепочка продолжают проверяться Node.js.
// Root SHA-256: d26d2d0231b7c39f92cc738512ba54103519e4405d68b5bd703e9788ca8ecf31
// Sub CA SHA-256: 2155785036c900dbb5f1bb2a1569c80c55595bd6bf94867a29bbddbc7d88a3f2
const ROSSTAT_CA_BUNDLE = `-----BEGIN CERTIFICATE-----
MIIFwjCCA6qgAwIBAgICEAAwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjIwMzAxMjEwNDE1WhcNMzIwMjI3MjEwNDE1WjBwMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMSAwHgYDVQQDDBdSdXNzaWFuIFRydXN0ZWQgUm9v
dCBDQTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAMfFOZ8pUAL3+r2n
qqE0Zp52selXsKGFYoG0GM5bwz1bSFtCt+AZQMhkWQheI3poZAToYJu69pHLKS6Q
XBiwBC1cvzYmUYKMYZC7jE5YhEU2bSL0mX7NaMxMDmH2/NwuOVRj8OImVa5s1F4U
zn4Kv3PFlDBjjSjXKVY9kmjUBsXQrIHeaqmUIsPIlNWUnimXS0I0abExqkbdrXbX
YwCOXhOO2pDUx3ckmJlCMUGacUTnylyQW2VsJIyIGA8V0xzdaeUXg0VZ6ZmNUr5Y
Ber/EAOLPb8NYpsAhJe2mXjMB/J9HNsoFMBFJ0lLOT/+dQvjbdRZoOT8eqJpWnVD
U+QL/qEZnz57N88OWM3rabJkRNdU/Z7x5SFIM9FrqtN8xewsiBWBI0K6XFuOBOTD
4V08o4TzJ8+Ccq5XlCUW2L48pZNCYuBDfBh7FxkB7qDgGDiaftEkZZfApRg2E+M9
G8wkNKTPLDc4wH0FDTijhgxR3Y4PiS1HL2Zhw7bD3CbslmEGgfnnZojNkJtcLeBH
BLa52/dSwNU4WWLubaYSiAmA9IUMX1/RpfpxOxd4Ykmhz97oFbUaDJFipIggx5sX
ePAlkTdWnv+RWBxlJwMQ25oEHmRguNYf4Zr/Rxr9cS93Y+mdXIZaBEE0KS2iLRqa
OiWBki9IMQU4phqPOBAaG7A+eP8PAgMBAAGjZjBkMB0GA1UdDgQWBBTh0YHlzlpf
BKrS6badZrHF+qwshzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qwshzAS
BgNVHRMBAf8ECDAGAQH/AgEEMA4GA1UdDwEB/wQEAwIBhjANBgkqhkiG9w0BAQsF
AAOCAgEAALIY1wkilt/urfEVM5vKzr6utOeDWCUczmWX/RX4ljpRdgF+5fAIS4vH
tmXkqpSCOVeWUrJV9QvZn6L227ZwuE15cWi8DCDal3Ue90WgAJJZMfTshN4OI8cq
W9E4EG9wglbEtMnObHlms8F3CHmrw3k6KmUkWGoa+/ENmcVl68u/cMRl1JbW2bM+
/3A+SAg2c6iPDlehczKx2oa95QW0SkPPWGuNA/CE8CpyANIhu9XFrj3RQ3EqeRcS
AQQod1RNuHpfETLU/A2gMmvn/w/sx7TB3W5BPs6rprOA37tutPq9u6FTZOcG1Oqj
C/B7yTqgI7rbyvox7DEXoX7rIiEqyNNUguTk/u3SZ4VXE2kmxdmSh3TQvybfbnXV
4JbCZVaqiZraqc7oZMnRoWrXRG3ztbnbes/9qhRGI7PqXqeKJBztxRTEVj8ONs1d
WN5szTwaPIvhkhO3CO5ErU2rVdUr89wKpNXbBODFKRtgxUT70YpmJ46VVaqdAhOZ
D9EUUn4YaeLaS8AjSF/h7UkjOibNc4qVDiPP+rkehFWM66PVnP1Msh93tc+taIfC
EYVMxjh8zNbFuoc7fzvvrFILLe7ifvEIUqSVIC/AzplM/Jxw7buXFeGP1qVCBEHq
391d/9RAfaZ12zkwFsl+IKwE/OZxW8AHa9i1p4GO0YSNuczzEm4=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIG6DCCBNCgAwIBAgICEAUwDQYJKoZIhvcNAQELBQAwcDELMAkGA1UEBhMCUlUx
PzA9BgNVBAoMNlRoZSBNaW5pc3RyeSBvZiBEaWdpdGFsIERldmVsb3BtZW50IGFu
ZCBDb21tdW5pY2F0aW9uczEgMB4GA1UEAwwXUnVzc2lhbiBUcnVzdGVkIFJvb3Qg
Q0EwHhcNMjQwNzE1MTI1MDQxWhcNMjkwNzE5MTI1MDQxWjBvMQswCQYDVQQGEwJS
VTE/MD0GA1UECgw2VGhlIE1pbmlzdHJ5IG9mIERpZ2l0YWwgRGV2ZWxvcG1lbnQg
YW5kIENvbW11bmljYXRpb25zMR8wHQYDVQQDDBZSdXNzaWFuIFRydXN0ZWQgU3Vi
IENBMIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA1j0rkZECOt1S8o7I
JY+4YKAxuEa5xaHKHXT2EpkuC/0krqMOjUy2oPIRNgR5g8X0Jl6jamxeGLc4Q1tf
ju6or9oSRYThIUhRsFDQNBiBBEXoBgWxTfiKB2eyT97+pz5TBtBiRCPaLGRHYLRb
9Jz2HkJlxbtNPjtDrF5DPHym+mZ1M1z3hIQYAqJwLpsEBnsw/VxWMlxqHoeewd0h
uJMd71KQ5vOKlz7KrIZ6EobNNa6wItuvsfj3kYCK7O78uLHGXXFxdr8Hae9lMUmC
8F7AFwa+bO1LRlTlqW7rE3rLf+jj70N01N8T3o22v14YBaFBWQWncAVYD2JuL3tH
252+kdNOERf1fLbLRigJAbd+hOhWYlNf963TFDgnNPliHNIW72SygVBnI2V3JwO1
dp1hVKpK/zt8ziGdHW4gmOLTsH50YKdR4jNqUgQv4wASlKn9OpN6zHYc5G8h86fY
BM+zxE5ikGI+I/vIqBuI0eaDU92AWN/YjFLpu8tMu9kLRSCf1vug6FIfDPWVo7iP
ac/SI2v8jnnpaW7ph/Pz3WkzaG7ZZJsfFs+8dploWc6LOoDtbFBhMdGMxu024msC
0PSjZb5ODXPIaO2NsA7fMiAtZcoK6anTUJh4zOP/stA9qsJGNxdrEmiPXSmBZY/N
Y0wkZgZ6JTDhw7038bPvctkblJkCAwEAAaOCAYswggGHMB0GA1UdDgQWBBR3Pdk5
r0K93FvKduru/c4+YSkwXzAfBgNVHSMEGDAWgBTh0YHlzlpfBKrS6badZrHF+qws
hzAOBgNVHQ8BAf8EBAMCAYYwEgYDVR0TAQH/BAgwBgEB/wIBADCBmAYIKwYBBQUH
AQEEgYswgYgwQAYIKwYBBQUHMAKGNGh0dHA6Ly9udWMtY2RwLnZvc2tob2QucnUv
Y2RwL3Jvb3RjYV9zc2xfcnNhMjAyMi5jcnQwRAYIKwYBBQUHMAKGOGh0dHA6Ly9u
dWMtY2RwLmRpZ2l0YWwuZ292LnJ1L2NkcC9yb290Y2Ffc3NsX3JzYTIwMjIuY3J0
MIGFBgNVHR8EfjB8MDqgOKA2hjRodHRwOi8vbnVjLWNkcC52b3NraG9kLnJ1L2Nk
cC9yb290Y2Ffc3NsX3JzYTIwMjIuY3JsMD6gPKA6hjhodHRwOi8vbnVjLWNkcC5k
aWdpdGFsLmdvdi5ydS9jZHAvcm9vdGNhX3NzbF9yc2EyMDIyLmNybDANBgkqhkiG
9w0BAQsFAAOCAgEAmsINXtQ7wwUWvIeOr80MdJS/5G4xhyZOVEmeUorThquT672y
cCg3XCxc4fwbiZqSSbBqntQ7RtiTAKMYMvBageKoVHbzz+R4jX01tKcTx8cDePrz
dJ73bLNUorE7RU9QsW4KyiUeRmjMDV23AUlEvuQFTwgkHXvbac1BBdPn9CrssQuF
5EGohZKcQPFiAAc4SHbRNhlr7uAwgpc/erzI9EAcvA6BVAXcVKoeGpV01uexUgZ6
St5RP9UmDWNA7T4yVXWJ233N0Q8bl+6AswINQ3PosPu6yQQHQjr65YS06epK+AeI
6j+oGR4xI7EhTQhQvaobnGmX/8QQ7XDRYCP2HXYxiffnn/CfZ/BVyKLYeY1ZipjE
nzqdQIC2+Q3WtY8jsVRQMP38WFRmtsIt5snehnPTs5bKGVIcYzj3o3Ex/K7agEz0
zAJ0JR5ivXZOvNkT0g9x1v+S1IkU3e/nX1a+tpRquMtnHX0L2lXArNHUbaOO9EJt
d57WaIpofV5cVhhwShOgAuBc9UMJF3/n4t4RKiPxtsK8P67gcmphMhslj7AMYrYM
ej2NvQZY4m3ub3CPC/PrTjDONvb+8g5xrKtxBjYqC74HSB4dg9G3WimSDUuP2Su6
G2y2TUeyJuCvCLz289VoO0vg7cNdMobE3KCqAiiNhN2VBFxHAUKmUoRcRdw=
-----END CERTIFICATE-----`;

class DataSourceError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'DataSourceError';
        this.code = code;
    }
}

function isOfficialRosstatUrl(value) {
    const url = new URL(value);
    return url.protocol === 'https:' && /^(?:www\.|ssl\.)?rosstat\.gov\.ru$/i.test(url.hostname);
}

function requestBuffer(url, { accept, maxBytes = MAX_RESPONSE_BYTES, redirects = 0 } = {}) {
    if (!isOfficialRosstatUrl(url)) {
        return Promise.reject(new DataSourceError('fetch_failed', `Недопустимый URL источника: ${url}`));
    }

    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            ca: ROSSTAT_CA_BUNDLE,
            headers: {
                Accept: accept || '*/*',
                'User-Agent': 'my-calculator-inflation-updater/2.0'
            },
            timeout: REQUEST_TIMEOUT_MS
        }, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();
                if (!response.headers.location || redirects >= 3) {
                    reject(new DataSourceError('fetch_failed', 'Некорректный redirect официального источника'));
                    return;
                }

                const redirectUrl = new URL(response.headers.location, url).toString();
                requestBuffer(redirectUrl, { accept, maxBytes, redirects: redirects + 1 }).then(resolve, reject);
                return;
            }

            if (response.statusCode !== 200) {
                response.resume();
                reject(new DataSourceError('fetch_failed', `Официальный источник вернул HTTP ${response.statusCode}`));
                return;
            }

            const declaredLength = Number(response.headers['content-length'] || 0);
            if (declaredLength > maxBytes) {
                response.destroy();
                reject(new DataSourceError('validation_failed', 'Ответ официального источника превышает допустимый размер'));
                return;
            }

            const chunks = [];
            let received = 0;

            response.on('data', (chunk) => {
                received += chunk.length;
                if (received > maxBytes) {
                    response.destroy(new DataSourceError('validation_failed', 'Ответ официального источника превышает допустимый размер'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => resolve({
                body: Buffer.concat(chunks),
                contentType: String(response.headers['content-type'] || '').toLowerCase(),
                url
            }));
            response.on('error', reject);
        });

        request.on('timeout', () => request.destroy(new DataSourceError('timeout', 'Таймаут официального источника')));
        request.on('error', reject);
    });
}

function decodeHtml(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function discoverWorkbook(landingHtml) {
    const titleIndex = landingHtml.indexOf(SOURCE_DOCUMENT_TITLE);
    if (titleIndex === -1) {
        throw new DataSourceError('source_format_changed', 'На странице Росстата не найден требуемый набор ИПЦ');
    }

    const beforeTitle = landingHtml.slice(Math.max(0, titleIndex - 2_000), titleIndex);
    const hrefMatches = [...beforeTitle.matchAll(/href=["']([^"']+)["']/gi)];
    const href = hrefMatches.at(-1)?.[1];
    const afterTitle = landingHtml.slice(titleIndex, titleIndex + 600);
    const publishedMatch = afterTitle.match(/(\d{2})\.(\d{2})\.(\d{4})/);

    if (!href || !publishedMatch) {
        throw new DataSourceError('source_format_changed', 'Не удалось определить файл или дату публикации набора ИПЦ');
    }

    const exportUrl = new URL(decodeHtml(href), SOURCE_LANDING_URL).toString();
    if (!isOfficialRosstatUrl(exportUrl) || !/\/ipc_mes_\d{2}-\d{4}\.xlsx$/i.test(new URL(exportUrl).pathname)) {
        throw new DataSourceError('source_format_changed', 'Росстат опубликовал неожиданный URL набора ИПЦ');
    }

    return {
        exportUrl,
        sourcePublishedAt: `${publishedMatch[3]}-${publishedMatch[2]}-${publishedMatch[1]}`
    };
}

function findEndOfCentralDirectory(buffer) {
    const minimumOffset = Math.max(0, buffer.length - 65_557);
    for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
    }
    throw new DataSourceError('source_format_changed', 'XLSX не содержит корректный ZIP-каталог');
}

function unzipEntries(buffer) {
    if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
        throw new DataSourceError('source_format_changed', 'Официальный файл не является XLSX');
    }

    const eocdOffset = findEndOfCentralDirectory(buffer);
    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    let offset = buffer.readUInt32LE(eocdOffset + 16);
    const entries = new Map();

    for (let index = 0; index < entryCount; index += 1) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) {
            throw new DataSourceError('source_format_changed', 'Поврежден ZIP-каталог XLSX');
        }

        const flags = buffer.readUInt16LE(offset + 8);
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const fileNameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localHeaderOffset = buffer.readUInt32LE(offset + 42);
        const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8');

        if ((flags & 1) !== 0 || ![0, 8].includes(method) || uncompressedSize > MAX_RESPONSE_BYTES) {
            throw new DataSourceError('source_format_changed', 'XLSX использует неподдерживаемый ZIP-формат');
        }
        if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
            throw new DataSourceError('source_format_changed', 'Поврежден локальный заголовок XLSX');
        }

        const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
        const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
        const content = method === 0 ? compressed : zlib.inflateRawSync(compressed);

        if (content.length !== uncompressedSize) {
            throw new DataSourceError('source_format_changed', 'Размер ZIP-записи XLSX не совпадает с каталогом');
        }

        entries.set(fileName.replace(/\\/g, '/'), content);
        offset += 46 + fileNameLength + extraLength + commentLength;
    }

    return entries;
}

function decodeXml(value) {
    return decodeHtml(value)
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function getXmlAttribute(attributes, name) {
    const escapedName = name.replace(':', '\\:');
    const match = attributes.match(new RegExp(`(?:^|\\s)${escapedName}=["']([^"']*)["']`, 'i'));
    return match ? decodeXml(match[1]) : null;
}

function readXmlEntry(entries, name) {
    const entry = entries.get(name);
    if (!entry) throw new DataSourceError('source_format_changed', `В XLSX отсутствует ${name}`);
    return entry.toString('utf8');
}

function findWorksheetPath(entries, sheetName) {
    const workbookXml = readXmlEntry(entries, 'xl/workbook.xml');
    const relationshipsXml = readXmlEntry(entries, 'xl/_rels/workbook.xml.rels');
    let relationshipId = null;

    for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?\s*>/gi)) {
        if (getXmlAttribute(match[1], 'name') === sheetName) {
            relationshipId = getXmlAttribute(match[1], 'r:id');
            break;
        }
    }

    if (!relationshipId) {
        throw new DataSourceError('source_format_changed', `В XLSX отсутствует лист ${sheetName}`);
    }

    for (const match of relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)) {
        if (getXmlAttribute(match[1], 'Id') === relationshipId) {
            const target = getXmlAttribute(match[1], 'Target').replace(/^\//, '');
            return target.startsWith('xl/') ? target : path.posix.normalize(path.posix.join('xl', target));
        }
    }

    throw new DataSourceError('source_format_changed', `В XLSX отсутствует связь листа ${sheetName}`);
}

function parseSharedStrings(entries) {
    const entry = entries.get('xl/sharedStrings.xml');
    if (!entry) return [];

    const xml = entry.toString('utf8');
    return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)].map((match) =>
        [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
            .map((textMatch) => decodeXml(textMatch[1]))
            .join('')
    );
}

function parseWorksheetRows(sheetXml, sharedStrings) {
    const rows = [];

    for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gi)) {
        const cells = new Map();
        const rowNumber = Number(getXmlAttribute(rowMatch[1], 'r'));

        for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
            const attributes = cellMatch[1];
            const reference = getXmlAttribute(attributes, 'r');
            const type = getXmlAttribute(attributes, 't');
            const column = reference?.match(/^[A-Z]+/i)?.[0]?.toUpperCase();
            const body = cellMatch[2] || '';
            const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1];
            let value = null;

            if (type === 's' && rawValue !== undefined) {
                value = sharedStrings[Number(rawValue)];
            } else if (type === 'inlineStr') {
                value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)]
                    .map((match) => decodeXml(match[1]))
                    .join('');
            } else if (rawValue !== undefined) {
                const decoded = decodeXml(rawValue);
                const numeric = Number(decoded);
                value = Number.isFinite(numeric) ? numeric : decoded;
            }

            if (column && value !== undefined && value !== null) cells.set(column, value);
        }

        rows.push({ rowNumber, cells });
    }

    return rows;
}

function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseCpiIndex(value) {
    if (typeof value === 'number') return value;
    const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NaN;
}

function round(value, decimals = 6) {
    return Number(value.toFixed(decimals));
}

function validateAnnual(annual, expectedLastYear) {
    if (!Array.isArray(annual) || annual.length !== expectedLastYear - MIN_YEAR + 1) {
        throw new DataSourceError('validation_failed', 'Официальный годовой ряд неполон');
    }

    annual.forEach((record, index) => {
        const expectedYear = MIN_YEAR + index;
        if (record.year !== expectedYear) {
            throw new DataSourceError('validation_failed', `Нарушена последовательность годов около ${expectedYear}`);
        }
        if (!Number.isFinite(record.cpi_index) || record.cpi_index < 50 || record.cpi_index > 300) {
            throw new DataSourceError('validation_failed', `Недопустимый ИПЦ за ${record.year} год`);
        }
        if (!Number.isFinite(record.inflation_percent) || Math.abs(record.inflation_percent - (record.cpi_index - 100)) > 1e-6) {
            throw new DataSourceError('validation_failed', `Несогласованные значения за ${record.year} год`);
        }
    });
}

function parseInflationWorkbook(workbook, exportUrl) {
    const fileMatch = new URL(exportUrl).pathname.match(/ipc_mes_(\d{2})-(\d{4})\.xlsx$/i);
    if (!fileMatch) throw new DataSourceError('source_format_changed', 'Неожиданное имя официального XLSX');

    const sourceMonth = Number(fileMatch[1]);
    const sourceYear = Number(fileMatch[2]);
    if (sourceMonth < 1 || sourceMonth > 12 || sourceYear < MIN_YEAR) {
        throw new DataSourceError('source_format_changed', 'Некорректный период официального XLSX');
    }

    const latestCompletedYear = sourceMonth === 12 ? sourceYear : sourceYear - 1;
    const entries = unzipEntries(workbook);
    const sharedStrings = parseSharedStrings(entries);
    const sheetPath = findWorksheetPath(entries, '01');
    const rows = parseWorksheetRows(readXmlEntry(entries, sheetPath), sharedStrings);
    const yearRow = rows.find((row) =>
        [...row.cells.values()].filter((value) => Number.isInteger(value) && value >= 1991 && value <= sourceYear).length >= 20
    );
    const sectionIndex = rows.findIndex((row) => normalizeText(row.cells.get('A')) === 'к декабрю предыдущего года');
    const annualRow = rows.slice(sectionIndex + 1).find((row) => normalizeText(row.cells.get('A')) === 'декабрь');

    if (!yearRow || sectionIndex === -1 || !annualRow) {
        throw new DataSourceError('source_format_changed', 'В XLSX не найден годовой ряд «декабрь к декабрю»');
    }

    const annual = [];
    for (const [column, value] of yearRow.cells.entries()) {
        const year = Number(value);
        if (!Number.isInteger(year) || year < MIN_YEAR || year > latestCompletedYear) continue;

        const cpiIndex = parseCpiIndex(annualRow.cells.get(column));
        annual.push({
            year,
            cpi_index: cpiIndex,
            inflation_percent: round(cpiIndex - 100)
        });
    }

    annual.sort((left, right) => left.year - right.year);
    validateAnnual(annual, latestCompletedYear);
    return annual;
}

function baseMetadata() {
    return {
        schema_version: 2,
        status: 'unavailable',
        source_name: 'Росстат / ЕМИСС',
        source_url: SOURCE_URL,
        source_landing_url: SOURCE_LANDING_URL,
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
        last_attempt_at: null,
        status_reason: null
    };
}

function isValidStoredDataset(value) {
    try {
        if (!value || value.metadata?.schema_version !== 2 || !['ok', 'stale'].includes(value.metadata.status)) return false;
        if (!isOfficialRosstatUrl(value.metadata.source_export_url)) return false;
        if (!/^[0-9a-f]{64}$/i.test(value.metadata.source_checksum_sha256 || '')) return false;
        if (!value.metadata.last_successful_fetch_at) return false;
        if (!Number.isInteger(value.metadata.data_through)) return false;
        validateAnnual(value.annual, value.metadata.data_through);
        if (value.annual.at(-1)?.year !== value.metadata.data_through) return false;
        return true;
    } catch {
        return false;
    }
}

function readJson(outputPath) {
    try {
        return JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    } catch {
        return null;
    }
}

function sameOfficialData(previous, official) {
    return previous.metadata.status === 'ok'
        && previous.metadata.source_export_url === official.exportUrl
        && previous.metadata.source_checksum_sha256 === official.checksum
        && previous.metadata.source_published_at === official.sourcePublishedAt
        && JSON.stringify(previous.annual) === JSON.stringify(official.annual);
}

function writeJsonAtomic(outputPath, value) {
    const temporaryPath = path.join(path.dirname(outputPath), `.inflation.${process.pid}.tmp`);
    try {
        fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        fs.renameSync(temporaryPath, outputPath);
    } finally {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
}

function statusReason(error) {
    if (error instanceof DataSourceError) return error.code;
    if (error?.code === 'ETIMEDOUT' || error?.code === 'UND_ERR_CONNECT_TIMEOUT') return 'timeout';
    if (error instanceof SyntaxError || error instanceof RangeError) return 'source_format_changed';
    return 'fetch_failed';
}

async function loadOfficialData() {
    const landingResponse = await requestBuffer(SOURCE_LANDING_URL, { accept: 'text/html' });
    if (!landingResponse.contentType.includes('text/html')) {
        throw new DataSourceError('source_format_changed', 'Страница Росстата вернула неожиданный Content-Type');
    }

    const source = discoverWorkbook(landingResponse.body.toString('utf8'));
    const workbookResponse = await requestBuffer(source.exportUrl, {
        accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    if (!/(spreadsheet|octet-stream|zip)/.test(workbookResponse.contentType)) {
        throw new DataSourceError('source_format_changed', 'Файл Росстата вернул неожиданный Content-Type');
    }

    return {
        ...source,
        checksum: crypto.createHash('sha256').update(workbookResponse.body).digest('hex'),
        annual: parseInflationWorkbook(workbookResponse.body, source.exportUrl)
    };
}

async function updateInflation(options = {}) {
    const outputPath = options.outputPath || OUTPUT_PATH;
    const attemptAt = options.now || new Date().toISOString();
    const loader = options.loader || loadOfficialData;
    const storedState = readJson(outputPath);
    const previous = isValidStoredDataset(storedState) ? storedState : null;
    let result;

    try {
        const official = await loader();
        const dataThrough = official.annual.at(-1).year;
        if (previous && sameOfficialData(previous, official)) {
            // Стабильный JSON не создает ежедневные commits только из-за timestamp.
            result = previous;
            console.log(`Росстат: официальный ряд по ${dataThrough} год не изменился.`);
        } else {
            result = {
                metadata: {
                    ...baseMetadata(),
                    status: 'ok',
                    source_export_url: official.exportUrl,
                    source_checksum_sha256: official.checksum,
                    data_through: dataThrough,
                    source_published_at: official.sourcePublishedAt,
                    last_successful_fetch_at: attemptAt,
                    last_attempt_at: attemptAt,
                    status_reason: null
                },
                annual: official.annual
            };
            console.log(`Росстат: получен официальный ряд за ${MIN_YEAR}–${dataThrough} годы.`);
        }
    } catch (error) {
        const reason = statusReason(error);
        console.error(`Не удалось обновить официальный ряд (${reason}): ${error.message}`);

        if (previous) {
            result = previous.metadata.status === 'stale' && previous.metadata.status_reason === reason
                ? previous
                : {
                    metadata: {
                        ...previous.metadata,
                        status: 'stale',
                        last_attempt_at: attemptAt,
                        status_reason: reason
                    },
                    annual: previous.annual
                };
            console.log(`Сохранен последний успешный ряд по ${previous.metadata.data_through} год.`);
        } else {
            const unchangedUnavailable = storedState?.metadata?.schema_version === 2
                && storedState.metadata.status === 'unavailable'
                && storedState.metadata.status_reason === 'no_saved_dataset'
                && Array.isArray(storedState.annual)
                && storedState.annual.length === 0;
            result = unchangedUnavailable
                ? storedState
                : {
                    metadata: {
                        ...baseMetadata(),
                        status: 'unavailable',
                        last_attempt_at: attemptAt,
                        status_reason: 'no_saved_dataset'
                    },
                    annual: []
                };
            console.log('Последний успешный официальный ряд отсутствует; данные временно недоступны.');
        }
    }

    writeJsonAtomic(outputPath, result);
    return result;
}

if (require.main === module) {
    updateInflation().catch((error) => {
        console.error('Критическая ошибка записи inflation.json:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    DataSourceError,
    discoverWorkbook,
    isValidStoredDataset,
    parseInflationWorkbook,
    updateInflation
};
