const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { payloadChecksum } = require('../../data_validation/validate.js');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const script = read('car-vs-taxi.html').match(/<script>\s*(const state = \{[\s\S]*?)<\/script>/)[1];
const fixture = require('../data-validation/fixtures/financial-goal-rates.json');
const now = Date.parse('2026-11-05T12:00:00Z');
const hourMs = 60 * 60 * 1000;

function rates({ value = 16.25, status = 'ok', age = hourMs } = {}) {
    const fetched = new Date(now - age).toISOString();
    const keyRate = { ...fixture.key_rate, value_percent: value };
    return {
        ...fixture, status, fetched_at: fetched, cb_rate: value,
        key_rate: keyRate,
        metadata: {
            ...fixture.metadata, status, status_reason: status === 'ok' ? null : 'fetch_failed',
            last_successful_fetch_at: fetched, last_attempt_at: new Date(now).toISOString(),
            payload_checksum_sha256: payloadChecksum(keyRate)
        }
    };
}

const textNode = (value) => ({ textContent: value, cloneNode: () => textNode(value) });

function node() {
    const classes = new Set();
    return {
        style: {},
        innerText: '',
        childNodes: [],
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name)
        },
        set textContent(value) { this.childNodes = [textNode(value)]; },
        get textContent() { return this.childNodes.map(child => child.textContent).join(''); },
        append(...children) {
            this.childNodes.push(...children.map(child => typeof child === 'string' ? textNode(child) : child));
        },
        replaceChildren(...children) { this.childNodes = children; },
        cloneNode() { return Object.assign(node(), this); }
    };
}

function page(fetch) {
    const nodes = new Map();
    const element = (id) => {
        if (!nodes.has(id)) nodes.set(id, node());
        return nodes.get(id);
    };
    const env = vm.createContext({
        document: { getElementById: element, querySelectorAll: () => [], createElement: node },
        window: {}, fetch, console: { error() {} },
        Date: class extends Date { static now() { return now; } },
        initTheme() {}, showToast() {}, shareLink() {}
    });
    vm.runInContext(read('js/api.js') + read('js/utils.js') + script, env);
    const run = (code) => vm.runInContext(code, env);
    run("setCarPreset('comfort')");
    return { run, element };
}

const rubles = (element) => Number(element.innerText.replace(/[^\d]/g, ''));

for (const scenario of [
    { name: 'fresh official rate with decimals', data: rates(), base: 16.25, opportunity: 370500 },
    { name: 'stale official rate at hard TTL', data: rates({ status: 'stale', age: 168 * hourMs }), base: 16.25, opportunity: 370500, stale: true },
    { name: 'official zero rate', data: rates({ value: 0 }), base: 0, opportunity: 0 },
    { name: 'expired stale rate', data: rates({ status: 'stale', age: 168 * hourMs + 1 }) },
    { name: 'old snapshot still marked ok', data: rates({ age: 72 * hourMs + 1 }) },
    { name: 'published unavailable status', data: rates({ status: 'unavailable' }) },
    { name: 'conflicting statuses', data: { ...rates(), status: 'stale' } },
    { name: 'network failure', fetch: async () => { throw new Error('offline'); } },
    { name: 'HTTP error', fetch: async () => ({ ok: false }) },
    { name: 'invalid JSON', fetch: async () => ({ ok: true, json: async () => JSON.parse('{') }) },
    { name: 'legacy number without provenance', data: { cb_rate: 16.25 } },
    { name: 'missing checksum', data: { ...rates(), metadata: { ...rates().metadata, source_checksum_sha256: null } } },
    { name: 'invalid effective date', data: { ...rates(), effective_from: '2026-09-31', key_rate: { value_percent: 16.25, effective_from: '2026-09-31' } } },
    { name: 'untrusted source', data: { ...rates(), metadata: { ...rates().metadata, source_url: 'https://www.cbr.ru.example/hd_base/keyrate/' } } },
    { name: 'contradictory rate values', data: { ...rates(), cb_rate: 19 } },
    { name: 'malformed rate value', data: rates({ value: '16.25' }) }
]) {
    test(`car/taxi uses the correct rate and disclosure with ${scenario.name}`, async () => {
        const { run, element } = page(scenario.fetch ?? (async () => ({ ok: true, json: async () => scenario.data })));
        await run('loadOpportunityRate()');
        const official = scenario.base !== undefined;
        const opportunity = scenario.opportunity ?? 494000;
        assert.equal(run('state.cbRate'), scenario.base ?? 21);
        assert.equal(rubles(element('grid-car-annual')), 418748);
        assert.equal(rubles(element('grid-taxi-annual')), 180000);
        assert.equal(element('lost-opportunity-card').classList.contains('hidden'), true);

        run('handleLostOppToggle(true)');
        assert.equal(rubles(element('grid-car-annual')), 418748 + opportunity);
        assert.equal(rubles(element('grid-taxi-annual')), 180000);
        assert.equal(rubles(element('lost-opp-annual')), opportunity);
        assert.equal(element('lost-opportunity-card').classList.contains('hidden'), false);
        const note = element('opportunity-rate-note');
        assert.equal(note.textContent, element('opportunity-result-rate-note').textContent);
        if (official) {
            assert.match(note.textContent, /27\.07\.2026/);
            assert.match(note.textContent, scenario.base === 0 ? /0% годовых/ : /16,25%.*14,25% годовых/);
            assert.equal(note.childNodes[1].href, fixture.source_url);
            assert.equal(note.textContent.includes('данные устарели'), Boolean(scenario.stale));
        } else {
            assert.match(note.textContent, /данные недоступны.*условная базовая ставка 21%.*19% годовых.*Это допущение/);
            assert.doesNotMatch(note.textContent, /Источник:|\d{2}\.\d{2}\.\d{4}/);
            assert.equal(note.childNodes.length, 1);
        }

        run('handleLostOppToggle(false)');
        assert.equal(rubles(element('grid-car-annual')), 418748);
        assert.equal(element('lost-opportunity-card').classList.contains('hidden'), true);
    });
}
