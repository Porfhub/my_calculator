const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'sw.js'), 'utf8');
const currentName = 'yasnomera-cache-v18';
const previousName = 'yasnomera-cache-v17';
const tailwind = 'https://cdn.tailwindcss.com';
const chart = 'https://cdn.jsdelivr.net/npm/chart.js';
const screenshot = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const designSystem = '/css/design-system.css';
const origin = 'https://yasnomera.test';

function setup({ previous = [], failPrecache = false, failCopy = false, fetch }) {
    const old = new Map(previous);
    const current = new Map();
    const buckets = new Map([['other-cache', new Map()]]);
    if (previous.length) buckets.set(previousName, old);
    const key = (request) => {
        const url = new URL(typeof request === 'string' ? request : request.url, origin);
        return url.origin === origin ? url.pathname + url.search : url.href;
    };
    const handlers = {};
    const lifecycle = [];
    vm.runInNewContext(source, {
        URL, AbortSignal, fetch,
        self: {
            addEventListener: (name, handler) => { handlers[name] = handler; },
            skipWaiting: async () => { lifecycle.push('skipWaiting'); },
            clients: { claim: async () => { lifecycle.push('claim'); } }
        },
        caches: {
            keys: async () => [...buckets.keys()],
            delete: async (name) => buckets.delete(name),
            match: async (request, { cacheName }) => buckets.get(cacheName)?.get(key(request)),
            open: async (name) => {
                assert.equal(name, currentName);
                buckets.set(name, current);
                return {
                    async addAll(files) {
                        assert.ok(files.every((file) => file.startsWith('/')));
                        if (failPrecache) throw new Error('required local resource failed');
                        for (const file of files) current.set(file, new Response(file));
                    },
                    match: async (request) => current.get(key(request)),
                    async put(request, response) {
                        if (failCopy && old.get(key(request)) === response) throw new Error('cache quota exceeded');
                        current.set(key(request), response);
                    }
                };
            }
        }
    });

    async function dispatch(name, request) {
        const pending = [];
        let response;
        handlers[name]({
            request,
            waitUntil: (promise) => pending.push(promise),
            respondWith: (promise) => { response = promise; }
        });
        const result = await response;
        await Promise.all(pending);
        return result;
    }

    return { dispatch, buckets, current, lifecycle };
}

test('failed and non-OK CDN responses do not prevent installation of the local shell', async () => {
    const requested = [];
    const sw = setup({
        async fetch(url, options) {
            requested.push(url);
            assert.equal(options.mode, 'cors');
            assert.ok(options.signal instanceof AbortSignal);
            if (url === tailwind) throw new TypeError('CORS blocked');
            return new Response(url, { status: url === screenshot ? 503 : 200 });
        }
    });

    await sw.dispatch('install');
    await sw.dispatch('activate');

    assert.deepEqual(requested, [tailwind, chart, screenshot]);
    assert.deepEqual(sw.lifecycle, ['skipWaiting', 'claim']);
    assert.ok(sw.current.has('/mortgage.html') && sw.current.has(designSystem));
    assert.ok(sw.current.has(chart));
    assert.ok(!sw.current.has(new URL(tailwind).href) && !sw.current.has(screenshot));
    assert.ok(sw.buckets.has('other-cache'));
});

test('a successful upgrade carries cached CDN responses forward before deleting v17', async () => {
    const cachedTailwind = { ok: false, type: 'opaque' };
    const cachedChart = new Response('chart from v17');
    const sw = setup({
        previous: [[new URL(tailwind).href, cachedTailwind], [chart, cachedChart]],
        async fetch(url) {
            assert.equal(url, screenshot);
            throw new TypeError('offline CDN');
        }
    });

    await sw.dispatch('install');
    assert.ok(sw.buckets.has(previousName));
    await sw.dispatch('activate');

    assert.ok(!sw.buckets.has(previousName));
    assert.equal(sw.current.get(new URL(tailwind).href), cachedTailwind);
    assert.equal(sw.current.get(chart), cachedChart);
});

test('a missing local resource leaves v17 available and prevents activation', async () => {
    const cachedMortgage = new Response('mortgage from v17');
    const sw = setup({
        previous: [['/mortgage.html', cachedMortgage]],
        failPrecache: true,
        fetch: () => assert.fail('CDN fetch should wait for the required precache')
    });

    await assert.rejects(sw.dispatch('install'), /required local resource failed/);
    assert.deepEqual(sw.lifecycle, []);
    assert.equal(sw.buckets.get(previousName).get('/mortgage.html'), cachedMortgage);
});

test('a failed copy of a working CDN response prevents replacement of v17', async () => {
    const cachedChart = new Response('chart from v17');
    const sw = setup({
        previous: [[chart, cachedChart]],
        failCopy: true,
        fetch: () => assert.fail('CDN fetch should wait for migration of usable entries')
    });

    await assert.rejects(sw.dispatch('install'), /cache quota exceeded/);
    assert.deepEqual(sw.lifecycle, []);
    assert.equal(sw.buckets.get(previousName).get(chart), cachedChart);
});

test('an HTTP error does not overwrite the cached local resource', async () => {
    let online = true;
    const sw = setup({
        async fetch(request) {
            if (typeof request === 'string' || !online) throw new TypeError('unavailable');
            return new Response('server error', { status: 503 });
        }
    });
    await sw.dispatch('install');
    const request = new Request(origin + designSystem);

    assert.equal((await sw.dispatch('fetch', request)).status, 503);
    online = false;
    assert.equal(await (await sw.dispatch('fetch', request)).text(), designSystem);
});
