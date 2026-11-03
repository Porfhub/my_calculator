const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs/qa/financial-goal');
const baselineRef = '2cc3460a5abac52534bcbcad3d5ae25bc02379b7';
const baseline = execFileSync('git', ['show', baselineRef + ':millionaire.html']);
const pathname = '/millionaire.html';
const canonical = 'https://yasnomera.ru/millionaire.html';
const widths = [[320, 640], [375, 812], [390, 844], [768, 1024], [1366, 900]];
const now = new Date('2026-11-03T12:00:00Z');
const channel = process.env.QA_BROWSER || 'chrome';
const saveArtifacts = channel === 'chrome';
const assetDirectory = process.env.GOAL_QA_ASSETS || path.join(os.tmpdir(), 'yasnomera-financial-goal-qa');
const vendor = name => path.join(assetDirectory, 'node_modules', name);
const inflation = require('../tests/data-validation/fixtures/inflation.json');
const rates = require('../tests/data-validation/fixtures/financial-goal-rates.json');
const staleRates = (fetched = rates.fetched_at) => ({
    ...rates, fetched_at: fetched, status: 'stale',
    metadata: { ...rates.metadata, status: 'stale', status_reason: 'http_error', last_successful_fetch_at: fetched }
});
const norm = text => text.replace(/[\u00a0\u202f]/g, ' ').trim();

function serve(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === pathname && url.searchParams.has('baseline')) {
        return res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(baseline);
    }
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    const mime = {
        '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
        '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8'
    };
    fs.readFile(file, (error, bytes) => res.writeHead(error ? 404 : 200, {
        'Content-Type': mime[path.extname(file)] || 'application/octet-stream'
    }).end(error ? 'Not found' : bytes));
}

async function contextFor(browser, viewport, colorScheme = 'light') {
    const mobile = viewport.width < 768;
    const context = await browser.newContext({
        ...(mobile ? devices['Pixel 7'] : {}),
        viewport, colorScheme, acceptDownloads: true, reducedMotion: 'reduce',
        serviceWorkers: 'block', locale: 'ru-RU', timezoneId: 'Europe/Moscow', deviceScaleFactor: 1
    });
    await context.addInitScript(() => {
        window.qaGoals = [];
        window.ym = (...args) => window.qaGoals.push(args);
    });
    const assets = {
        'https://cdn.tailwindcss.com/': path.join(assetDirectory, 'tailwind.js'),
        'https://cdn.jsdelivr.net/npm/chart.js': path.join(vendor('chart.js'), 'dist/chart.umd.js'),
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js': path.join(vendor('html2canvas'), 'dist/html2canvas.min.js')
    };
    await context.route(/^https?:/, route => {
        const url = route.request().url();
        if (url.startsWith('http://127.0.0.1:')) return route.fallback();
        const file = assets[url];
        if (file) return route.fulfill({ path: file, contentType: 'application/javascript' });
        if (url.startsWith('https://mc.yandex.ru/')) return route.fulfill({ status: 200, body: '' });
        return route.abort();
    });
    return context;
}

const hasText = async (page, selector, value) => assert.match(norm(await page.locator(selector).innerText()), value, selector);
const state = async (page, expected) => assert.equal(await page.locator('body').getAttribute('data-calculation-state'), expected);
const fill = (page, id, value) => page.locator('#' + id).fill(value);
const open = (page, id) => page.locator('#' + id + ' > summary').click();
const check = (page, name, value) => page.locator('input[name="' + name + '"][value="' + value + '"]').check();
const screenshot = (page, name, fullPage = false) => saveArtifacts && page.screenshot({
    path: path.join(out, name + '.png'), fullPage, animations: 'disabled'
});
const goals = page => page.evaluate(() => window.qaGoals.filter(args => args[1] === 'reachGoal'));
const overflow = page => page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    if (scrollWidth <= clientWidth) return false;
    return {
        scrollWidth, clientWidth,
        nodes: [...document.querySelectorAll('body *')].map(node => ({
            element: node.id || node.tagName,
            right: node.getBoundingClientRect().right
        })).filter(node => node.right > clientWidth)
    };
});
const allowedGoals = (page, names) => goals(page).then(args => assert.deepEqual(args, names.map(name => [110360838, 'reachGoal', name])));
const fixtureRoutes = (context, rate = rates, historical = inflation) => Promise.all([
    context.route('**/rates.json', route => route.fulfill({ json: rate })),
    context.route('**/inflation.json', route => route.fulfill({ json: historical }))
]);

async function ready(page, url) {
    await page.clock.setFixedTime(now);
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#rate-reference')?.dataset.status === 'ok' &&
        document.querySelector('#inflation-reference')?.dataset.status === 'ok' && typeof Chart === 'function' &&
        typeof html2canvas === 'function');
}

async function captureBaseline(browser, url) {
    if (!saveArtifacts) return;
    for (const [width, height, label] of [[390, 844, 'mobile'], [1366, 900, 'desktop']]) {
        const context = await contextFor(browser, { width, height });
        await fixtureRoutes(context, rates, inflation);
        const page = await context.newPage();
        await page.clock.setFixedTime(now);
        await page.goto(url + '?baseline');
        await page.waitForFunction(() => typeof tailwind !== 'undefined' && typeof Chart === 'function' &&
            document.getElementById('interest-rate').value === '14');
        await screenshot(page, label + '-before-light');
        await context.close();
    }
}

async function assertChart(page, months) {
    if (months === 0) {
        assert.equal(await page.locator('#chart-frame').isVisible(), false);
        await hasText(page, '#chart-description', /^Месяц 0/);
        return;
    }
    const chart = await page.evaluate(() => {
        const { scales, data, options } = Chart.getChart('growth-chart');
        const x = scales.x;
        return {
            scale: x.type, animation: options.animation, first: data.datasets[0].data[0].x,
            last: data.datasets[0].data.at(-1).x, targetLast: data.datasets[1].data.at(-1).x,
            count: data.datasets[0].data.length,
            ratio: (x.getPixelForValue(12) - x.getPixelForValue(0)) /
                (x.getPixelForValue(13) - x.getPixelForValue(12))
        };
    });
    assert.equal(chart.scale, 'linear');
    assert.equal(chart.animation, false);
    assert.equal(chart.first, 0);
    assert.equal(chart.last, months);
    assert.equal(chart.targetLast, months);
    assert.ok(Math.abs(chart.ratio - 12) < 0.000001);
    if (months <= 120) assert.equal(chart.count, months + 1);
}

async function download(page, name) {
    await page.evaluate(() => {
        window.qaExport = null;
        const observe = new MutationObserver(() => {
            const stage = document.querySelector('[data-screenshot-stage]');
            if (!stage) return;
            window.qaExport = { masked: stage.matches('.ym-hide-content'), text: stage.innerText, chart: Boolean(stage.querySelector('img')) };
            observe.disconnect();
        });
        observe.observe(document.body, { childList: true });
    });
    const pending = page.waitForEvent('download', { timeout: 15000 });
    await page.locator('#save-png').click();
    const item = await pending;
    assert.equal(item.suggestedFilename(), 'yasnomera-financial-goal.png');
    assert.equal(await item.failure(), null);
    const png = fs.readFileSync(await item.path());
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1180);
    const height = png.readUInt32BE(20);
    assert.ok(height > 1200 && height < 2300, 'PNG height ' + height);
    const exported = await page.evaluate(() => window.qaExport);
    const text = norm(exported.text);
    assert.ok(exported.masked && exported.chart);
    for (const fragment of [
        'Ясномера · Финансовая цель', '1 год', 'ноябрь 2027 года', 'ноябрь 2026', '1 000 000 ₽',
        '100 000 ₽', '80 000 ₽', '14% годовых', 'Росстат / ЕМИСС', '2011–2025', '1 070 480,63 ₽',
        '960 000 ₽', '1 060 000 ₽', 'Расчётный доход', '78 993,83 ₽', '1 138 993,83 ₽',
        'Капитал в сегодняшних рублях', 'Порог в сегодняшних рублях', 'С учётом роста цен', 'Доходность не гарантирована'
    ]) assert.ok(text.toLocaleLowerCase('ru').includes(fragment.toLocaleLowerCase('ru')), fragment + '\n' + text);
    assert.ok(!text.includes('Сохранить PNG'));
    assert.equal(await page.locator('[data-screenshot-stage]').count(), 0);
    if (saveArtifacts && name) await item.saveAs(path.join(out, name + '.png'));
    return { width: 1180, height, bytes: png.length, saved: saveArtifacts && name ? name + '.png' : null };
}

async function clipboard(page, context, url) {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await page.locator('#copy-link').click();
    await page.waitForFunction(() => document.getElementById('action-status').textContent === 'Ссылка скопирована.');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), canonical);
    assert.equal(new URL(page.url()).search, '?utm_source=qa');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
        configurable: true, value: { writeText: async () => { throw new Error('denied'); } }
    }));
    await page.locator('#copy-link').click();
    assert.equal(await page.locator('#share-dialog').isVisible(), true);
    assert.equal(await page.locator('#share-url').inputValue(), canonical);
    assert.equal(await page.locator('#action-status').innerText(), '');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#share-dialog').isVisible(), false);
}

async function matrixCase(browser, url, width, height, theme) {
    const context = await contextFor(browser, { width, height }, theme);
    await fixtureRoutes(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const name = theme === 'dark' ? 'graphite' : 'light';
    const label = width === 390 ? 'mobile' : width === 1366 ? 'desktop' : null;
    await ready(page, url + '?utm_source=qa');
    await state(page, 'READY');
    await hasText(page, '#result-answer', /^1 год$/);
    await hasText(page, '#result-date', /ноябрь 2027 года/);
    await hasText(page, '#result-conditions', /80 000 ₽ в месяц, без доходности и роста суммы цели/);
    assert.equal(await page.locator('#example-badge').isVisible(), true);
    assert.equal(await overflow(page), false);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    assert.equal(await page.locator(theme === 'dark' ? '#sun-icon' : '#moon-icon').isVisible(), true);
    assert.equal(await page.locator(theme === 'dark' ? '#moon-icon' : '#sun-icon').isVisible(), false);
    await hasText(page, '.goal-brand', /^ЯСНОМЕРА$/);
    for (const id of ['goal-settings', 'goal-budget', 'goal-method']) {
        assert.equal(await page.locator('#' + id).getAttribute('open'), null);
    }
    await hasText(page, '#settings-summary', /^Без доходности · Фиксированная сумма$/);
    await allowedGoals(page, []);
    const firstViewport = await page.evaluate(() => ['goal-sum', 'current-savings', 'monthly-contribution', 'result-answer']
        .map(id => Math.round(document.getElementById(id).getBoundingClientRect().bottom)));
    if (width === 390) assert.ok(firstViewport.every(bottom => bottom <= height), firstViewport);
    if (label) await screenshot(page, label + '-after-' + name);

    await open(page, 'goal-settings');
    assert.equal(await page.locator('#goal-sources').getAttribute('open'), null);
    await open(page, 'goal-sources');
    await hasText(page, '#rate-reference', /Ключевая ставка Банка России — 14% с 27 июля 2026 г./);
    await hasText(page, '#inflation-reference', /7,048063% годовых · 2011–2025/);
    await open(page, 'goal-sources');
    await allowedGoals(page, []);
    await check(page, 'return-mode', 'manual');
    await state(page, 'INVALID_INPUT');
    await hasText(page, '#annual-return-error', /Укажите годовую ставку/);
    assert.equal(await page.locator('#save-png').isDisabled(), true);
    assert.equal(await page.locator('#screenshot-area').isVisible(), false);
    await allowedGoals(page, []);

    await fill(page, 'annual-return', '12');
    await state(page, 'READY');
    await hasText(page, '#return-explanation', /уже накопленные деньги.*со следующего/);
    await open(page, 'return-example');
    await hasText(page, '#return-example', /1 000 ₽.*20 000 ₽.*121 000 ₽/);
    await open(page, 'goal-settings');
    await hasText(page, '#settings-summary', /^Доходность 12% годовых · Фиксированная сумма$/);
    await open(page, 'goal-settings');
    if (width === 390 && theme === 'dark' && saveArtifacts) {
        await page.locator('#goal-settings').screenshot({ path: path.join(out, 'mobile-return-example-graphite.png') });
    }
    await open(page, 'return-example');
    await fill(page, 'annual-return', '14');
    await state(page, 'READY');
    await hasText(page, '#result-answer', /^11 месяцев$/);
    await hasText(page, '#capital-values', /1 046 781,38 ₽/);
    await hasText(page, '#power-context', /983 426,88 ₽ в сегодняшних ценах/);
    assert.equal(await page.locator('#power-target').isVisible(), false);
    await open(page, 'power-details');
    await hasText(page, '#power-target', /Порог цели эквивалентен 939 476,86 ₽/);
    await open(page, 'power-details');
    await assertChart(page, 11);
    await allowedGoals(page, ['calculate_success']);
    if (width === 1366 && theme === 'light') await screenshot(page, 'desktop-fixed-result', true);
    await check(page, 'goal-mode', 'today');
    await state(page, 'READY');
    await hasText(page, '#result-answer', /^1 год$/);
    await hasText(page, '#capital-values', /1 070 480,63 ₽/);
    await hasText(page, '#capital-values', /Порог с учётом роста цен\s+1 070 480,63 ₽\s+Итого накоплено\s+1 138 993,83 ₽/);
    await hasText(page, '#chart-caption', /Порог меняется вместе с ценами/);
    await hasText(page, '#chart-description', /Месяц 12 — капитал 1 138 993,83 ₽, порог 1 070 480,63 ₽/);
    await open(page, 'goal-settings');
    await hasText(page, '#settings-summary', /^Доходность 14% годовых · С учётом роста цен$/);
    await open(page, 'goal-settings');
    await assertChart(page, 12);
    if (width === 390 && theme === 'dark') {
        await page.locator('#goal-settings').scrollIntoViewIfNeeded();
        await screenshot(page, 'mobile-settings-graphite');
    }
    if (width === 1366 && theme === 'dark') await screenshot(page, 'desktop-inflation-graphite', true);
    if (width === 390 && theme === 'light' && saveArtifacts) {
        await page.locator('#chart-section').screenshot({ path: path.join(out, 'mobile-chart-light.png') });
        await page.locator('#screenshot-area').evaluate(node => node.scrollIntoView());
        await screenshot(page, 'mobile-lower-light');
    }
    const png = await download(page, label && 'download-' + label + '-' + name);
    await allowedGoals(page, ['calculate_success']);

    await open(page, 'goal-budget');
    await fill(page, 'budget-income', '140000,25');
    await fill(page, 'budget-expenses', '60000,25');
    await open(page, 'return-example');
    await open(page, 'goal-sources');
    await open(page, 'goal-method');
    await hasText(page, '#goal-method', /R\/1200/);
    await hasText(page, '#goal-method', /1 200 месяцев/);
    assert.equal(await overflow(page), false);
    if (width === 1366 && theme === 'light') {
        await page.locator('#goal-settings').evaluate(node => node.scrollIntoView());
        await screenshot(page, 'desktop-expanded-light');
    }
    await open(page, 'goal-method');
    await open(page, 'goal-sources');
    await open(page, 'return-example');
    await hasText(page, '#budget-result', /остаётся 80 000 ₽ в месяц/);
    assert.equal(norm(await page.locator('#monthly-contribution').inputValue()), '80 000');
    await fill(page, 'budget-expenses', '80000,25');
    await hasText(page, '#apply-budget', /60 000 ₽/);
    assert.equal(norm(await page.locator('#monthly-contribution').inputValue()), '80 000');
    if (width === 390 && theme === 'light') {
        await page.locator('#goal-budget').scrollIntoViewIfNeeded();
        await screenshot(page, 'mobile-budget-light');
    }
    await page.locator('#apply-budget').click();
    assert.equal(norm(await page.locator('#monthly-contribution').inputValue()), '60 000');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'monthly-contribution');
    await fill(page, 'budget-expenses', '150000,25');
    await hasText(page, '#budget-result', /превышают доход на 10 000 ₽/);
    assert.equal(await page.locator('#apply-budget').isDisabled(), true);
    assert.equal(await overflow(page), false);
    await open(page, 'goal-budget');
    await check(page, 'goal-mode', 'fixed');
    await check(page, 'return-mode', 'zero');
    await open(page, 'goal-settings');

    await fill(page, 'goal-sum', '9 007 199 254 740 993');
    assert.equal((await page.locator('#goal-sum').inputValue()).replace(/\s/g, ''), '9007199254740993');
    await state(page, 'INVALID_INPUT');
    await hasText(page, '#goal-sum-error', /0,01 ₽ до 100 000 000 ₽/);
    assert.equal(await page.locator('#result-date').isVisible(), false);
    assert.equal(await page.locator('#save-png').isDisabled(), true);
    if (width === 390 && theme === 'light') {
        await page.evaluate(() => scrollTo(0, 0));
        await screenshot(page, 'mobile-invalid-light');
    }

    await fill(page, 'goal-sum', '500000');
    await fill(page, 'monthly-contribution', '0');
    await state(page, 'CALCULATION_IMPOSSIBLE');
    await hasText(page, '#result-answer', /накопления не растут/);
    assert.equal(await page.locator('#chart-section').isVisible(), false);
    await fill(page, 'monthly-contribution', '0,01');
    await hasText(page, '#result-answer', /расчётного горизонта — 100 лет/);
    if (width === 390 && theme === 'light') await screenshot(page, 'mobile-horizon-light');
    await fill(page, 'current-savings', '1000000');
    await state(page, 'READY');
    await hasText(page, '#result-answer', /Цель уже достигнута/);
    await hasText(page, '#result-conditions', /У вас 1 000 000 ₽ при цели 500 000 ₽/);
    assert.equal(await page.locator('#result-date').isVisible(), false);
    await assertChart(page, 0);
    if (width === 390 && theme === 'light') await screenshot(page, 'mobile-already-light');

    await clipboard(page, context, url);
    await allowedGoals(page, ['calculate_success', 'share_click', 'share_click']);
    assert.deepEqual(errors, []);
    assert.equal(await overflow(page), false);

    let accessibility = null;
    if ((width === 390 || width === 1366) && process.env.AXE_CORE_MODULE) {
        await open(page, 'goal-settings');
        await open(page, 'goal-budget');
        await page.addScriptTag({ path: process.env.AXE_CORE_MODULE });
        accessibility = await page.evaluate(async () => {
            const result = await axe.run({ runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
            return { passes: result.passes.length, violations: result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })) };
        });
        assert.deepEqual(accessibility.violations, []);
    }
    await context.close();
    return { width, height, theme, firstViewport, png, accessibility };
}


async function exerciseInput(browser, url) {
    const context = await contextFor(browser, { width: 390, height: 844 });
    await fixtureRoutes(context);
    const page = await context.newPage();
    await ready(page, url);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'goal-brand');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'theme-toggle');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#sun-icon').isVisible(), true);
    assert.equal(await page.locator('#moon-icon').isVisible(), false);
    await allowedGoals(page, []);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'goal-sum');
    assert.equal(await page.locator('#goal-sum').evaluate(node => getComputedStyle(node).outlineStyle), 'solid');

    const goal = page.locator('#goal-sum');
    await goal.fill('');
    await state(page, 'INVALID_INPUT');
    assert.equal(await goal.inputValue(), '');
    await allowedGoals(page, []);
    await page.keyboard.type('1234567');
    assert.equal(norm(await goal.inputValue()), '1 234 567');
    await goal.evaluate(node => node.setSelectionRange(2, 2));
    await page.keyboard.press('Backspace');
    assert.equal(norm(await goal.inputValue()), '234 567');
    await goal.evaluate(node => node.setSelectionRange(3, 3));
    await page.keyboard.press('Delete');
    assert.equal(norm(await goal.inputValue()), '23 467');
    await goal.evaluate(node => node.setSelectionRange(2, 2));
    await page.keyboard.type('9');
    assert.equal(norm(await goal.inputValue()), '239 467');
    assert.equal(await goal.evaluate(node => node.selectionStart), 3);
    await goal.evaluate(node => node.setSelectionRange(1, 5));
    await page.keyboard.type('8');
    assert.equal(norm(await goal.inputValue()), '2 867');

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await page.evaluate(() => navigator.clipboard.writeText('1 234\u00a0567\u202f890,25'));
    await goal.selectText();
    await page.keyboard.press('Control+v');
    await page.waitForFunction(() => document.getElementById('goal-sum').value.replace(/\s/g, '') === '1234567890,25');
    await state(page, 'INVALID_INPUT');
    await goal.fill('−1000');
    assert.equal(await goal.inputValue(), '−1000');
    await hasText(page, '#goal-sum-error', /знака минус/);
    await goal.fill('100oops25');
    assert.equal(await goal.inputValue(), '100oops25');
    await state(page, 'INVALID_INPUT');

    const cdp = await context.newCDPSession(page);
    await goal.fill('');
    await goal.focus();
    await cdp.send('Input.imeSetComposition', { text: '201.25', selectionStart: 6, selectionEnd: 6 });
    assert.equal(await goal.inputValue(), '201.25');
    assert.equal(await page.locator('#save-png').isDisabled(), true);
    await cdp.send('Input.insertText', { text: '201.25' });
    assert.equal(await goal.inputValue(), '201,25');
    await fill(page, 'current-savings', '100.25');
    await fill(page, 'monthly-contribution', '50,50');
    await hasText(page, '#result-answer', /^2 месяца$/);
    await hasText(page, '#capital-values', /201,25 ₽/);
    assert.equal(await page.locator('#capital-values > div').count(), 4);
    assert.equal(norm(await page.locator('#capital-values dd').allTextContents().then(values => values.join(' '))), '100,25 ₽ 101 ₽ 0 ₽ 201,25 ₽');
    assert.equal(await page.locator('#power-details').isVisible(), false);

    await page.setViewportSize({ width: 390, height: 420 });
    const contribution = page.locator('#monthly-contribution');
    await contribution.focus();
    await contribution.scrollIntoViewIfNeeded();
    assert.equal(await contribution.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return document.elementFromPoint(rect.x + 20, rect.y + 20) === node;
    }), true);
    assert.equal(await overflow(page), false);
    await page.setViewportSize({ width: 768, height: 844 });
    await page.evaluate(() => { document.body.style.zoom = '200%'; });
    assert.equal(await overflow(page), false);
    await page.evaluate(() => { document.body.style.zoom = ''; });

    await page.locator('#goal-settings > summary').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#goal-settings').getAttribute('open'), '');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.name), 'return-mode');
    await page.keyboard.press('ArrowDown');
    await state(page, 'INVALID_INPUT');
    await fill(page, 'annual-return', '30,0001');
    await hasText(page, '#annual-return-error', /от 0% до 30%/);
    await page.keyboard.press('Enter');
    await state(page, 'INVALID_INPUT');
    await check(page, 'return-mode', 'zero');
    await fill(page, 'current-savings', '0');
    await fill(page, 'monthly-contribution', '100');
    for (const months of [1, 13, 1200]) {
        await fill(page, 'goal-sum', String(months * 100));
        await assertChart(page, months);
    }
    await fill(page, 'monthly-contribution', '0,01');
    await fill(page, 'goal-sum', '0,01');
    await assertChart(page, 1);
    assert.ok(await page.evaluate(() => Chart.getChart('growth-chart').scales.y.ticks.some(tick => tick.label === '0,01 ₽')));
    await allowedGoals(page, ['calculate_success']);
    await context.close();
    return ['tab order', 'visible focus', 'theme keyboard', 'decimal typing', 'mid-string caret', 'selection replace',
        'separator Backspace and Delete', 'real clipboard paste', 'CDP IME composition', 'short viewport',
        '200% CSS zoom', 'keyboard disclosure and radio', 'linear 1/13/1200 month points', 'kopeck chart labels'];
}

async function exerciseSources(browser, url) {
    const context = await contextFor(browser, { width: 390, height: 844 });
    let situation = 'initial';
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    await context.route('**/rates.json', async route => {
        if (situation === 'initial') return route.abort('failed');
        if (situation === 'broken') return route.fulfill({ json: { metadata: { status: 'ok' }, key_rate: { value_percent: 'fake' } } });
        if (situation === 'expired') return route.fulfill({ json: staleRates('2026-10-01T00:00:00Z') });
        return route.fulfill({ json: staleRates() });
    });
    await context.route('**/inflation.json', async route => {
        if (situation === 'initial') { await hold; return route.fulfill({ status: 503 }); }
        if (situation === 'broken') return route.fulfill({ json: null });
        if (situation === 'expired') return route.fulfill({ json: {
            metadata: { ...inflation.metadata, status: 'stale', data_through: 2024 },
            annual: inflation.annual.slice(0, -1)
        } });
        return route.fulfill({ json: { ...inflation, metadata: { ...inflation.metadata, status: 'stale' } } });
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(now);
    await page.goto(url);
    await state(page, 'READY');
    await hasText(page, '#result-answer', /^1 год$/);
    assert.equal(await page.locator('#inflation-reference').getAttribute('data-status'), 'loading');
    await open(page, 'goal-settings');
    await check(page, 'goal-mode', 'today');
    await open(page, 'goal-settings');
    await state(page, 'DATA_UNAVAILABLE');
    await hasText(page, '#result-answer', /Загружаем данные/);
    release();
    await page.waitForFunction(() => document.getElementById('inflation-reference').dataset.status === 'unavailable');
    await hasText(page, '#result-answer', /Данные об инфляции сейчас недоступны/);
    assert.equal(await page.locator('#result-answer').isVisible(), true);
    assert.equal(await page.locator('#save-png').isDisabled(), true);
    await allowedGoals(page, []);
    await page.locator('#use-fixed').click();
    await state(page, 'READY');
    await hasText(page, '#result-answer', /^1 год$/);
    await open(page, 'goal-settings');
    await open(page, 'goal-sources');
    await check(page, 'return-mode', 'manual');
    await fill(page, 'annual-return', '14');
    await hasText(page, '#result-answer', /^11 месяцев$/);
    assert.equal(await page.locator('#purchasing-power').isVisible(), false);
    assert.equal(await page.locator('#rate-reference').getAttribute('data-status'), 'unavailable');

    situation = 'broken';
    await page.locator('#retry-sources').click();
    await page.locator('#retry-sources').waitFor();
    await state(page, 'READY');
    assert.equal(await page.locator('#inflation-reference').getAttribute('data-status'), 'unavailable');
    assert.equal(await page.locator('#rate-reference').getAttribute('data-status'), 'unavailable');

    situation = 'expired';
    await page.locator('#retry-sources').click();
    await page.locator('#retry-sources').waitFor();
    await state(page, 'READY');
    assert.equal(await page.locator('#inflation-reference').getAttribute('data-status'), 'unavailable');
    assert.equal(await page.locator('#rate-reference').getAttribute('data-status'), 'unavailable');
    await check(page, 'goal-mode', 'today');
    await state(page, 'DATA_UNAVAILABLE');

    situation = 'recovered';
    await page.locator('#retry-sources').click();
    await page.waitForFunction(() => ['rate-reference', 'inflation-reference'].every(id => document.getElementById(id).dataset.status === 'stale'));
    await state(page, 'READY');
    await hasText(page, '#result-answer', /^1 год$/);
    await hasText(page, '#inflation-reference', /последний доступный ряд/);
    await allowedGoals(page, ['calculate_success']);

    // A renderer failure must clean up private DOM and emit no analytics.
    await page.evaluate(() => { window.html2canvas = async () => { throw new Error('test renderer failure'); }; });
    await page.locator('#save-png').click();
    await page.waitForFunction(() => document.getElementById('action-status').textContent.startsWith('Не удалось сохранить'));
    assert.equal(await page.locator('[data-screenshot-stage]').count(), 0);
    await allowedGoals(page, ['calculate_success']);
    await context.close();
    return ['fixed result during delayed requests', 'network failure', 'HTTP 503', 'null', 'malformed rate',
        'expired snapshots', 'explicit fixed-mode recovery', 'manual rate with broken reference', 'stale recovery', 'PNG failure cleanup'];
}

async function run() {
    fs.mkdirSync(out, { recursive: true });
    const server = http.createServer(serve);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = 'http://127.0.0.1:' + server.address().port + pathname;
    let browser;
    try {
        browser = await chromium.launch({ channel });
        await captureBaseline(browser, url);
        const matrix = [];
        for (const [width, height] of widths) {
            for (const theme of ['light', 'dark']) {
                console.log(channel, width, height, theme);
                matrix.push(await matrixCase(browser, url, width, height, theme));
            }
        }
        const results = {
            channel, version: browser.version(), fixtureClock: now.toISOString(), baselineRef, matrix,
            inputs: await exerciseInput(browser, url), sources: await exerciseSources(browser, url)
        };
        fs.writeFileSync(path.join(out, 'browser-results-' + channel + '.json'), JSON.stringify(results, null, 2) + '\n');
        console.log(channel + ': all ' + matrix.length + ' viewport/theme cases passed');
    } finally {
        await browser?.close();
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
