const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs/qa/honest-credit');
const baselineRef = 'd15233195d900ecb641a415901c7807697d13211';
const baseline = execFileSync('git', ['show', baselineRef + ':honest-credit.html']);
const pagePath = '/honest-credit.html';
const exporter = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
const fields = ['amount', 'term', 'rate', 'insurance', 'fee', 'services'];
const defaultInput = { amount: 500000, term: 36, rate: 12.9, insurance: 0, fee: 0, services: 0 };
const cases = {
    A: { total: '605 624,51 ₽', monthly: '16 822,90 ₽', rate: '12,900 %' },
    B: { total: '666 186,96 ₽', monthly: '18 505,19 ₽', rate: '19,699 %' },
    C: { total: '655 624,51 ₽', monthly: '16 822,90 ₽', rate: '20,432 %' },
    D: { total: '647 188,51 ₽', monthly: '17 421,90 ₽', rate: '18,285 %' }
};
const normalize = text => text.replace(/[\u00a0\u202f]/g, ' ').trim();

function serveFile(req, res) {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    fs.readFile(file, (error, bytes) => res.writeHead(error ? 404 : 200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream'
    }).end(error ? 'Not found' : bytes));
}

async function run() {
    fs.mkdirSync(out, { recursive: true });
    const server = http.createServer(serveFile);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const url = origin + pagePath;
    const channel = process.env.QA_BROWSER || 'chrome';
    let browser;
    const errors = [];
    const matrix = [];
    const pngs = [];
    const interactions = [];
    const axeResults = [];
    const screenshot = (page, name, fullPage = false) =>
        page.screenshot({ path: path.join(out, name + '.png'), fullPage, animations: 'disabled' });
    const action = (page, id) => page.locator('#credit-' + id);
    const field = (page, id) => page.locator('#' + id + '-input');
    const state = page => page.locator('body').getAttribute('data-calculation-state');
    const goals = page => page.evaluate(() => window.qaGoals.filter(args => args[2] === 'calculate_success'));
    const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const ready = page => page.waitForFunction(() => document.body.dataset.calculationState === 'READY');
    const assertText = async (locator, value) => assert.equal(normalize(await locator.innerText()), value);

    async function open(options, before = false) {
        const context = await browser.newContext({ ...options, serviceWorkers: 'block', acceptDownloads: true });
        await context.route('**/*', route => {
            const target = new URL(route.request().url());
            if (target.origin === origin) return before && target.pathname === pagePath
                ? route.fulfill({ body: baseline, contentType: 'text/html; charset=utf-8' })
                : route.continue();
            if (target.hostname === 'mc.yandex.ru') return route.fulfill({ contentType: 'text/javascript', body: '' });
            if (target.href === exporter && process.env.QA_HTML2CANVAS) {
                return route.fulfill({ path: process.env.QA_HTML2CANVAS, contentType: 'text/javascript' });
            }
            if (target.href === exporter || (before && ['cdn.tailwindcss.com', 'cdn.jsdelivr.net'].includes(target.hostname))) {
                return route.continue();
            }
            return route.abort();
        });
        await context.addInitScript(() => {
            window.qaGoals = [];
            window.qaAnalytics = [];
            window.ym = (...args) => {
                if (args[1] === 'init') window.qaAnalytics.push({ args, href: location.href, history: history.length });
                if (args[1] === 'reachGoal') window.qaGoals.push(args);
            };
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        return { context, page };
    }

    async function assertScenario(page, key) {
        assert.equal(await state(page), 'READY');
        await assertText(action(page, 'total'), cases[key].total);
        await assertText(action(page, 'annual-rate'), cases[key].rate);
        const highlights = normalize(await action(page, 'highlights').innerText());
        assert.ok(highlights.includes(cases[key].monthly), highlights);
        const breakdown = normalize(await action(page, 'breakdown').innerText());
        if (key === 'B') {
            assert.ok(breakdown.includes('116 186,96 ₽') && breakdown.includes('10 562,45 ₽'), breakdown);
            assert.ok(!highlights.includes('Отдельно в день оформления'));
        }
        if (key === 'C') assert.match(highlights, /Отдельно в день оформления\s+50 000 ₽/);
        if (key === 'D') {
            assert.match(highlights, /16 822,90 ₽ — платёж по кредиту, 599 ₽ — дополнительные услуги/);
            assert.match(highlights, /Отдельно в день оформления\s+20 000 ₽/);
            assert.match(breakdown, /21 564 ₽/);
        }
    }

    async function download(page, name, key) {
        await page.waitForFunction(() => typeof html2canvas === 'function');
        await page.evaluate(() => {
            if (window.qaExportInstrumented) return;
            window.qaExportInstrumented = true;
            const renderer = window.html2canvas;
            window.html2canvas = (stage, options) => {
                window.qaExport = {
                    text: stage.textContent, hiddenFromReplay: stage.classList.contains('ym-hide-content'),
                    allContentFits: stage.scrollWidth <= stage.clientWidth,
                    noControls: !stage.querySelector('button, input, select, nav'),
                    background: options.backgroundColor
                };
                return renderer(stage, options);
            };
        });
        const pending = page.waitForEvent('download');
        await action(page, 'png').click();
        const file = await pending;
        assert.equal(file.suggestedFilename(), 'yasnomera-honest-credit-cost.png');
        const bytes = fs.readFileSync(await file.path());
        assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
        assert.equal(bytes.readUInt32BE(16), 1200);
        assert.ok(bytes.readUInt32BE(20) > 1500);
        if (name) await file.saveAs(path.join(out, name + '.png'));
        const report = await page.evaluate(() => window.qaExport);
        assert.ok(report.hiddenFromReplay && report.allContentFits && report.noControls);
        assert.ok(normalize(report.text).includes(cases[key].total));
        assert.ok(normalize(report.text).includes(cases[key].rate));
        for (const label of ['Ясномера · Стоимость кредита', 'Сумма без допрасходов', 'Срок, месяцев', 'Ставка из договора',
            'Разовая страховая премия', 'Оплата страховки', 'Комиссия при оформлении', 'Ежемесячные услуги',
            'Долг по кредиту', 'Отдельно в день оформления', 'Из чего складываются выплаты']) {
            assert.ok(report.text.includes(label), label);
        }
        assert.equal(await page.locator('[data-screenshot-stage]').count(), 0);
        pngs.push({ scenario: key, screenshot: name, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), background: report.background });
    }

    async function share(page, context, key, overrides, actualCopy = false) {
        await action(page, 'share').click();
        const dialog = action(page, 'share-dialog');
        assert.ok(await dialog.isVisible());
        assert.match(await dialog.innerText(), /Их увидит любой, кому вы её отправите/);
        const shared = new URL(await action(page, 'share-value').inputValue());
        assert.equal(shared.search, '');
        assert.match(shared.hash, /^#credit=/);
        if (actualCopy) {
            await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
            await action(page, 'copy').click();
            await page.waitForFunction(() => document.getElementById('credit-share-status').textContent === 'Ссылка скопирована.');
            assert.equal(await page.evaluate(() => navigator.clipboard.readText()), shared.href);
        }
        await page.keyboard.press('Escape');
        const target = await context.newPage();
        target.on('pageerror', error => errors.push(error.message));
        shared.search = '?utm_source=synthetic&yclid=test-id';
        await target.goto(shared.href);
        await ready(target);
        assert.equal(target.url(), url + shared.search);
        await assertScenario(target, key);
        assert.ok(await target.locator('#scenario-badge').isHidden());
        const input = { ...defaultInput, ...overrides };
        for (const key of fields) {
            const value = await field(target, key).inputValue();
            assert.equal(Number(normalize(value).replaceAll(' ', '').replace(',', '.')), input[key], key);
        }
        assert.equal(await target.locator('#insurance-mode').inputValue(), overrides.financed ? 'financed' : 'separate');
        const analytics = await target.evaluate(() => window.qaAnalytics);
        assert.equal(analytics.length, 1);
        assert.equal(analytics[0].href, url + shared.search);
        assert.equal(analytics[0].args[2].url, analytics[0].href);
        assert.equal(analytics[0].history, await target.evaluate(() => history.length));
        assert.equal((await goals(target)).length, 0);
        await target.reload();
        await assertScenario(target, key);
        assert.equal((await goals(target)).length, 0);
        await target.close();
        return shared;
    }

    try {
        browser = await chromium.launch({ channel });
        for (const width of [320, 375, 390, 768, 1366]) {
            for (const colorScheme of ['light', 'dark']) {
                const theme = colorScheme === 'light' ? 'light' : 'graphite';
                const options = {
                    ...(width < 500 ? devices['Pixel 7'] : {}),
                    viewport: { width, height: width < 500 ? 844 : 900 }, colorScheme, reducedMotion: 'reduce', deviceScaleFactor: 1
                };
                const { context, page } = await open(options);
                await page.goto(url + '?utm_medium=qa&yclid=qa');
                await ready(page);
                assert.equal(await overflow(page), false);
                assert.equal((await goals(page)).length, 0);
                await assertScenario(page, 'A');
                const totalBottom = await action(page, 'total').evaluate(node => node.getBoundingClientRect().bottom);
                assert.equal(await page.evaluate(() => scrollY), 0);
                if (width === 390) assert.ok(totalBottom <= 844, 'Main result below first screen: ' + totalBottom);
                const minControl = await page.locator('button:visible, .credit-entry input:visible, summary:visible').evaluateAll(
                    nodes => Math.min(...nodes.map(node => node.getBoundingClientRect().height)));
                assert.ok(minControl >= 44, 'Touch target ' + minControl);
                if ((width === 390 || width === 1366) && !process.env.QA_NO_SCREENSHOTS) {
                    await screenshot(page, (width === 390 ? 'mobile' : 'desktop') + '-after-' + theme);
                    if (theme === 'light') {
                        const original = await open(options, true);
                        await original.page.goto(url);
                        await ready(original.page);
                        await original.page.waitForFunction(() => typeof tailwind !== 'undefined' && typeof Chart !== 'undefined');
                        await screenshot(original.page, (width === 390 ? 'mobile' : 'desktop') + '-before-light');
                        await original.context.close();
                    }
                }

                await page.keyboard.press('Tab');
                assert.equal(await page.evaluate(() => document.activeElement.className), 'credit-brand');
                await page.keyboard.press('Tab');
                assert.equal(await page.evaluate(() => document.activeElement.className), 'credit-home');
                await page.keyboard.press('Tab');
                assert.equal(await page.evaluate(() => document.activeElement.id), 'theme-toggle');
                await page.keyboard.press('Space');
                assert.equal(await page.locator('html').evaluate(node => node.classList.contains('dark')), colorScheme === 'light');
                await page.keyboard.press('Enter');
                assert.equal(await page.locator('html').evaluate(node => node.classList.contains('dark')), colorScheme === 'dark');

                const summary = page.locator('#credit-expenses summary');
                await summary.focus();
                await page.keyboard.press('Enter');
                assert.ok(await field(page, 'insurance').isVisible());
                assert.equal(await overflow(page), false);
                assert.equal((await goals(page)).length, 0);
                if (width === 1366 && theme === 'light' && !process.env.QA_NO_SCREENSHOTS) {
                    await screenshot(page, 'desktop-expenses-light', true);
                }
                if (process.env.AXE_CORE_MODULE && [390, 1366].includes(width)) {
                    await page.addScriptTag({ path: process.env.AXE_CORE_MODULE });
                    const violations = await page.evaluate(async () => (await axe.run({
                        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }
                    })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(node => node.target) })));
                    assert.deepEqual(violations, [], width + ' ' + theme + ' axe');
                    axeResults.push({ width, theme, violations });
                }

                await field(page, 'rate').fill('');
                assert.equal(await state(page), 'INVALID_INPUT');
                assert.ok(await action(page, 'png').isDisabled() && await action(page, 'share').isDisabled());
                assert.ok(await page.locator('#screenshot-area').isHidden());
                assert.equal(await action(page, 'total').textContent(), '');
                assert.match(await page.locator('#rate-error').innerText(), /укажите 0/);
                assert.equal((await goals(page)).length, 0);
                if (width === 390 && theme === 'light' && !process.env.QA_NO_SCREENSHOTS) {
                    await summary.click();
                    await screenshot(page, 'mobile-invalid-light');
                    await summary.click();
                }
                await field(page, 'rate').fill('12.9');
                assert.equal((await goals(page)).length, 0);
                await field(page, 'rate').fill('0,0');
                await assertText(action(page, 'total'), '500 000 ₽');
                assert.match(normalize(await action(page, 'highlights').innerText()), /13 888,89 ₽/);
                await field(page, 'rate').fill('12,9');
                assert.deepEqual(await goals(page), [[110360838, 'reachGoal', 'calculate_success']]);
                assert.ok(await page.locator('#scenario-badge').isHidden());

                await field(page, 'insurance').fill('50000');
                await page.locator('#insurance-mode').selectOption('financed');
                await assertScenario(page, 'B');
                if (width === 390 && theme === 'light' && !process.env.QA_NO_SCREENSHOTS) {
                    await screenshot(page, 'mobile-scenario-b', true);
                    await download(page, 'download-b-light', 'B');
                }
                await share(page, context, 'B', { insurance: 50000, financed: true }, width === 390 && theme === 'light');
                await page.locator('#insurance-mode').selectOption('separate');
                await assertScenario(page, 'C');
                if (width === 390 && theme === 'graphite' && !process.env.QA_NO_SCREENSHOTS) {
                    await screenshot(page, 'mobile-scenario-c-graphite', true);
                    await download(page, 'download-c-graphite', 'C');
                }
                await share(page, context, 'C', { insurance: 50000 });

                await field(page, 'insurance').fill('0');
                await field(page, 'fee').fill('20000');
                await field(page, 'services').fill('599');
                await assertScenario(page, 'D');
                await share(page, context, 'D', { fee: 20000, services: 599 });
                await download(page, width === 1366 && theme === 'light' && !process.env.QA_NO_SCREENSHOTS ? 'download-d-light' : null, 'D');

                await field(page, 'fee').fill('500000');
                assert.equal(await state(page), 'CALCULATION_IMPOSSIBLE');
                assert.match(await page.locator('#honest-credit-state-message').innerText(), /положительная сумма/);
                await field(page, 'fee').fill('0');
                await field(page, 'services').fill('0');
                await assertScenario(page, 'A');
                assert.equal(await page.locator('#expense-summary').innerText(), 'Не указаны');
                for (const key of ['amount', 'term']) {
                    await field(page, key).fill('');
                    assert.equal(await state(page), 'INVALID_INPUT');
                    await field(page, key).fill(String(defaultInput[key]));
                    await ready(page);
                }
                await field(page, 'amount').fill('10000000,01');
                assert.equal(await state(page), 'INVALID_INPUT');
                await field(page, 'amount').fill('10000000');
                await field(page, 'term').fill('120');
                await field(page, 'rate').fill('50');
                await ready(page);
                assert.equal(await overflow(page), false);
                assert.equal(page.url(), url + '?utm_medium=qa&yclid=qa');
                assert.equal((await goals(page)).length, 1);
                assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
                matrix.push({ width, theme, totalBottom, minControl, scenarios: 'A–E, zero, invalid, impossible, maximum', shares: 'B–D plus reload' });
                console.log('PASS', width, theme, 'total bottom', totalBottom);
                await context.close();
            }
        }

        const { context, page } = await open({ viewport: { width: 1366, height: 900 } });
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
        await page.goto(url);
        await ready(page);
        const amount = field(page, 'amount');
        await amount.click();
        await amount.press('Control+a');
        await amount.pressSequentially('500000.50');
        assert.equal(normalize(await amount.inputValue()), '500 000,50');
        await amount.evaluate(node => node.setSelectionRange(4, 4));
        await amount.press('Backspace');
        assert.equal(normalize(await amount.inputValue()), '50 000,50');
        await amount.fill('500000,50');
        await amount.evaluate(node => node.setSelectionRange(3, 3));
        await amount.press('Delete');
        assert.equal(normalize(await amount.inputValue()), '50 000,50');
        await amount.fill('500000,50');
        await amount.evaluate(node => node.setSelectionRange(5, 5));
        await amount.pressSequentially('7');
        assert.equal(normalize(await amount.inputValue()), '5 000 700,50');
        assert.equal(await amount.evaluate(node => node.selectionStart), 7);
        await amount.evaluate(node => node.setSelectionRange(0, 5));
        await amount.pressSequentially('2');
        assert.ok((await amount.inputValue()).startsWith('2'));
        for (const text of ['500\u00a0000,50', '500\u202f000.50', '-500000', '500000,555', '500o00']) {
            await page.evaluate(text => navigator.clipboard.writeText(text), text);
            await amount.press('Control+a');
            await amount.press('Control+v');
            if (text.startsWith('500\u00a0') || text.startsWith('500\u202f')) {
                assert.equal(normalize(await amount.inputValue()), '500 000,50');
                await ready(page);
            } else {
                assert.equal(await state(page), 'INVALID_INPUT');
                assert.equal(await amount.inputValue(), text);
            }
        }
        await amount.fill('500000');
        const cdp = await context.newCDPSession(page);
        await amount.press('Control+a');
        await cdp.send('Input.imeSetComposition', { text: '500000.5', selectionStart: 8, selectionEnd: 8 });
        assert.equal(await amount.inputValue(), '500000.5');
        assert.equal(await state(page), 'INVALID_INPUT');
        await cdp.send('Input.insertText', { text: '500000.50' });
        assert.equal(normalize(await amount.inputValue()), '500 000,50');
        await ready(page);
        await amount.press('Enter');
        assert.equal(page.url(), url);
        const termRange = page.locator('#term-range');
        await termRange.focus();
        await termRange.press('End');
        assert.equal(await field(page, 'term').inputValue(), '120');
        await termRange.press('Home');
        assert.equal(await field(page, 'term').inputValue(), '1');
        await field(page, 'term').fill('36');
        interactions.push('Native Backspace/Delete at separators, mid-string caret, selection replacement, clipboard paste, CDP IME commit and Enter');

        await page.locator('#credit-expenses summary').click();
        await field(page, 'insurance').fill('50000,04');
        await field(page, 'services').fill('599,99');
        await page.locator('#insurance-mode').selectOption('financed');
        const total = await action(page, 'total').innerText();
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }));
        await action(page, 'share').click();
        await action(page, 'copy').click();
        assert.match(await action(page, 'share-status').innerText(), /вручную/);
        const fractionalURL = await action(page, 'share-value').inputValue();
        await page.keyboard.press('Escape');
        await page.goto(fractionalURL);
        await page.waitForURL(url);
        await ready(page);
        assert.equal(await action(page, 'total').innerText(), total);
        assert.equal(normalize(await amount.inputValue()), '500 000,5');
        assert.equal(normalize(await field(page, 'insurance').inputValue()), '50 000,04');
        assert.equal(await field(page, 'services').inputValue(), '599,99');
        await page.reload();
        assert.equal(await action(page, 'total').innerText(), total);
        interactions.push('Manual copy fallback, same-document hash navigation, fractional share and reload');

        await page.goto(url + '?utm_source=synthetic&yclid=test-id#credit=%7Bbad');
        await ready(page);
        assert.ok(await action(page, 'share-error').isVisible());
        assert.equal(new URL(page.url()).hash, '');
        await assertScenario(page, 'A');
        assert.equal((await goals(page)).length, 0);
        assert.equal(await page.locator('.ym-record-keys, .ym-show-content').count(), 0);
        assert.equal(await page.locator('#credit-form :is(input,select):not(.ym-disable-keys)').count(), 0);
        assert.equal(await page.locator('#credit-form :is(input,select):not(.ym-hide-content *)').count(), 0);
        assert.ok(await page.locator('#credit-breakdown .credit-bar').evaluate(node => !!node.closest('.ym-hide-content')));
        assert.equal(await page.locator('#credit-share-dialog.ym-hide-content input.ym-disable-keys').count(), 1);

        await page.waitForFunction(() => typeof html2canvas === 'function');
        await page.evaluate(() => { window.html2canvas = undefined; });
        await action(page, 'png').click();
        await page.waitForFunction(() => document.getElementById('toast-message').textContent.startsWith('Не удалось создать'));
        assert.equal(await page.locator('[data-screenshot-stage]').count(), 0);
        interactions.push('Malformed share restores only example, Webvisor annotations, export rejection feedback and cleanup');
        assert.deepEqual(errors, []);
        await context.close();
        const filename = channel === 'chrome' ? 'browser-results.json' : 'browser-results-' + channel + '.json';
        fs.writeFileSync(path.join(out, filename), JSON.stringify({
            browser: browser.version(), channel, baseline: baselineRef, matrix, pngs, interactions, axeResults, errors
        }, null, 2) + '\n');
        console.log('PASS interaction suite and', pngs.length, 'real PNG downloads');
    } finally {
        await browser?.close();
        server.close();
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
