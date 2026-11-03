const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const out = process.env.TIME_QA_OUT || path.join(root, 'docs/qa/time-is-money');
const baselineRef = 'f8cf23302391ffa025e11e68057ec6cc795c8802';
const baseline = process.env.TIME_PRODUCTION_HTML
    ? fs.readFileSync(process.env.TIME_PRODUCTION_HTML)
    : execFileSync('git', ['show', baselineRef + ':time-is-money.html']);
const pagePath = '/time-is-money.html';
const financialKeys = ['price', 'income', 'hours', 'days', 'office', 'commute', 'unpaid'];
const widths = [320, 375, 390, 768, 1366];
const checks = [];
const comparison = [];
const contrast = {};

function check(name, condition) {
    assert.ok(condition, name);
    checks.push(name);
    console.log('PASS ' + name);
}

function serveFile(req, res) {
    const file = path.join(root, new URL(req.url, 'http://localhost').pathname);
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
    let browser;
    const errors = [];
    try {
        browser = await chromium.launch({ channel: process.env.QA_BROWSER || 'chrome' });
        async function openContext(options, before = false) {
            const context = await browser.newContext({ ...options, serviceWorkers: 'block', acceptDownloads: true });
            await context.route('**/*', route => {
                const target = new URL(route.request().url());
                if (target.origin === origin) {
                    return before && target.pathname === pagePath
                        ? route.fulfill({ body: baseline, contentType: 'text/html; charset=utf-8' })
                        : route.continue();
                }
                if (target.hostname === 'mc.yandex.ru') return route.fulfill({ contentType: 'text/javascript', body: '' });
                if (target.hostname === 'cdnjs.cloudflare.com' || (before && target.hostname === 'cdn.tailwindcss.com')) return route.continue();
                return route.abort();
            });
            await context.addInitScript(() => {
                window.qaGoals = [];
                window.qaInit = [];
                window.ym = (...args) => {
                    if (args[1] === 'init') window.qaInit.push({ args, href: location.href, history: history.length });
                    if (args[1] === 'reachGoal') window.qaGoals.push(args);
                };
            });
            const page = await context.newPage();
            page.on('pageerror', error => errors.push(error.message));
            return { page, context };
        }

        async function ready(page, query = '') {
            await page.goto(url + query);
            await page.waitForFunction(() => document.body.dataset.calculationState === 'READY');
        }
        const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(out, name + '.png'), fullPage, animations: 'disabled' });
        const dimensions = page => page.evaluate(() => ({
            pageWidth: document.documentElement.scrollWidth,
            viewport: innerWidth,
            purchaseBottom: document.querySelector('#purchase-input').getBoundingClientRect().bottom,
            incomeBottom: document.querySelector('#income-input').getBoundingClientRect().bottom,
            hoursBottom: document.querySelector('#purchase-hours').getBoundingClientRect().bottom,
            scroll: scrollY
        }));
        const hours = page => page.locator('#purchase-hours').innerText();
        const goals = page => page.evaluate(() => window.qaGoals.filter(args => args[2] === 'calculate_success'));
        const hasOverflow = page => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

        for (const width of widths) {
            const touch = width < 500 ? { ...devices['Pixel 7'], defaultBrowserType: undefined } : {};
            const options = { ...touch, deviceScaleFactor: 1, viewport: { width, height: width < 500 ? 844 : 900 } };
            for (const dark of [false, true]) {
                const themed = { ...options, colorScheme: dark ? 'dark' : 'light' };
                const after = await openContext(themed);
                const before = await openContext(themed, true);
                await Promise.all([ready(before.page), ready(after.page)]);
                await before.page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)));
                const beforeBounds = await dimensions(before.page);
                const afterBounds = await dimensions(after.page);
                const mode = dark ? 'graphite' : 'light';
                comparison.push({ width, mode, before: beforeBounds, after: afterBounds });
                assert.deepEqual([afterBounds.pageWidth, afterBounds.scroll], [width, 0]);
                check(width + ' ' + mode + ' opens without overflow or automatic scroll', true);
                if (width === 390) {
                    check(mode + ' 390×844 keeps both inputs and answer in the first viewport', Math.max(afterBounds.purchaseBottom, afterBounds.incomeBottom, afterBounds.hoursBottom) <= 844);
                    await shot(before.page, 'mobile-before-' + mode);
                    await shot(after.page, 'mobile-after-' + mode);
                }
                if (width === 1366) {
                    if (!dark) await shot(before.page, 'desktop-before-light');
                    await shot(after.page, 'desktop-after-' + mode);
                }
                await after.page.locator('#advanced-toggle').click();
                check(width + ' ' + mode + ' expanded controls fit', !await hasOverflow(after.page));
                const targets = await after.page.locator('[data-office-days]').evaluateAll(buttons => buttons.map(button => {
                    const { width, height } = button.getBoundingClientRect();
                    return [width, height];
                }));
                check(width + ' ' + mode + ' office controls are at least 44×44', targets.every(([w, h]) => w >= 44 && h >= 44));
                const huge = after.page.locator('#purchase-input');
                await huge.fill('999 999 999 999');
                await huge.blur();
                check(width + ' ' + mode + ' 12-digit price stays complete in the result without overflow',
                    (await after.page.locator('#result-purchase-price').innerText()).replace(/\D/g, '') === '999999999999' && !await hasOverflow(after.page));
                await before.context.close();
                await after.context.close();
            }
        }

        const { page, context } = await openContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
        const requests = [];
        page.on('request', request => requests.push(request));
        await ready(page, '?utm_source=synthetic&utm_medium=cpc&yclid=qa');
        check('hybrid starts at 299 hours, 37.4 days and 502 ₽/h', await hours(page) === '299'
            && /37,4 рабочего дня/.test(await page.locator('#scheduled-days-result').innerText())
            && /^502/.test(await page.locator('#effective-hourly-rate').innerText())
            && /26 часов/.test(await page.locator('#commute-impact').innerText()));
        check('UTM-only visit remains an example and does not convert', await page.locator('#scenario-badge').innerText() === 'По примеру' && (await goals(page)).length === 0);
        await page.locator('.time-method summary').click();
        check('reference rate is 577 ₽/h and details do not convert', /^577/.test(await page.locator('#scheduled-hourly-rate').innerText()) && (await goals(page)).length === 0);
        await page.locator('.time-method summary').click();

        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
        await page.locator('#share-time').click();
        const standardShare = new URL(await page.locator('#time-share-url').inputValue());
        check('standard share offers manual copy with the full scenario when Clipboard is absent',
            financialKeys.map(key => standardShare.searchParams.get(key)).join(',') === '150000,100000,8,5,3,60,0');
        await page.locator('#time-share-dialog button').click();

        for (const dark of [false, true]) {
            if (dark) await page.locator('#theme-toggle').click();
            await page.locator('#advanced-toggle').click();
            const selected = page.locator('[data-office-days="3"]');
            await page.keyboard.press('Tab');
            await page.locator('#income-input').focus();
            await page.locator('#income-input').fill('');
            const colors = await page.evaluate(() => {
                const style = id => getComputedStyle(document.querySelector(id));
                const pair = (fg, bg) => [style(fg).color, style(bg).backgroundColor];
                return {
                    eyebrow: pair('.time-intro .time-eyebrow', 'body'),
                    currency: pair('.time-money .time-input-wrap span', '#purchase-input'),
                    selected: pair('[data-office-days="3"]', '[data-office-days="3"]'),
                    disabled: pair('#share-time', '#share-time'),
                    error: pair('#income-error', '.time-money'),
                    focus: [style('#income-input').outlineColor, style('.time-money').backgroundColor],
                    focusWidth: style('#income-input').outlineWidth
                };
            });
            const luminance = rgb => rgb.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(channel => {
                const value = Number(channel) / 255;
                return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
            const ratios = Object.fromEntries(Object.entries(colors).filter(([key]) => key !== 'focusWidth').map(([key, [a, b]]) => {
                const [darker, lighter] = [luminance(a), luminance(b)].sort((x, y) => x - y);
                return [key, (lighter + 0.05) / (darker + 0.05)];
            }));
            const mode = dark ? 'graphite' : 'light';
            contrast[mode] = ratios;
            check(mode + ' text and disabled state meet 4.5:1 and focus ring meets 3:1',
                Object.entries(ratios).every(([key, ratio]) => ratio >= (key === 'focus' ? 3 : 4.5)) && colors.focusWidth === '3px');
            if (dark) {
                await page.evaluate(() => scrollTo(0, 0));
                await shot(page, 'mobile-invalid-graphite');
            }
            check(mode + ' invalid input removes result and disables both exports',
                await page.locator('#time-answer').isHidden() && await page.locator('#save-time-png').isDisabled() && await page.locator('#share-time').isDisabled());
            check(mode + ' invalid input did not fire calculate_success', (await goals(page)).length === (dark ? 1 : 0));
            await page.locator('#income-input').fill('100000');
            await selected.focus();
            check(mode + ' correction restores the current result', await hours(page) === '299' && await page.locator('#save-time-png').isEnabled());
            await page.locator('#advanced-toggle').click();
        }

        await page.locator('#advanced-toggle').click();
        const remote = page.locator('[data-office-days="0"]');
        await remote.focus();
        await page.keyboard.press('Space');
        check('Space keeps focus, sets aria-pressed and yields remote 260 / 32.5', await remote.evaluate(node => document.activeElement === node)
            && await remote.getAttribute('aria-pressed') === 'true' && await page.locator('#commute-input').isHidden()
            && await hours(page) === '260' && /32,5 рабочего дня/.test(await page.locator('#scheduled-days-result').innerText()));
        let copied;
        await page.exposeFunction('recordTimeCopy', value => { copied = value; });
        await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
            configurable: true, value: { writeText: window.recordTimeCopy }
        }));
        await page.locator('#share-time').click();
        await page.waitForFunction(() => document.querySelector('#toast-message').textContent === 'Ссылка скопирована');
        check('remote share uses legacy parameter shape without commute or attribution tags',
            new URL(copied).searchParams.get('office') === '0' && !/commute=|utm_|yclid=/.test(copied));
        const office = page.locator('[data-office-days="5"]');
        await office.focus();
        await page.keyboard.press('Enter');
        check('Enter keeps focus, sets aria-pressed and yields office 325 / 40.6', await office.evaluate(node => document.activeElement === node)
            && await office.getAttribute('aria-pressed') === 'true' && await hours(page) === '325'
            && /40,6 рабочего дня/.test(await page.locator('#scheduled-days-result').innerText()));

        const input = page.locator('#hours-input');
        await input.fill('');
        await input.pressSequentially('7,5');
        check('real Chromium keyboard keeps 7,5 and input focus', await input.inputValue() === '7,5' && await input.evaluate(node => document.activeElement === node));
        await page.locator('#work-days-input').fill('3,5');
        check('shortening the workweek leaves the office input intact with a local error', await page.locator('#office-days-input').inputValue() === '5'
            && /до 3,5/.test(await page.locator('#officeDays-error').innerText()));
        await page.locator('#office-days-input').fill('2,5');
        await page.locator('#overtime-input').fill('1,5');
        check('fractional values yield 213 hours, 28.4 days and 6.5 unpaid monthly hours', await hours(page) === '213'
            && /28,4 рабочего дня по 7,5 часа/.test(await page.locator('#scheduled-days-result').innerText())
            && /6,5 ч в месяц/.test(await page.locator('#overtime-impact').innerText()));
        await input.fill('');
        await input.pressSequentially('7.5');
        check('dot yields the identical calculation', await input.inputValue() === '7.5' && await hours(page) === '213');
        await page.locator('#back-to-result').click();
        check('explicit return puts focus on the result', await page.locator('#result-heading').evaluate(node => document.activeElement === node));
        await page.evaluate(() => scrollTo(0, 0));
        await page.locator('#toast.opacity-0').waitFor({ state: 'attached' });
        await shot(page, 'mobile-settings-graphite', true);

        const beforePng = await page.locator('#results-card').innerText();
        await page.evaluate(() => {
            window.prepareCalculationScreenshot = stage => {
                window.qaExport = { text: stage.innerText, controls: stage.querySelectorAll('button, input, dialog').length };
            };
        });
        const pending = page.waitForEvent('download');
        await page.locator('#save-time-png').click();
        const download = await pending;
        const imagePath = path.join(out, 'export-fractional-graphite.png');
        await download.saveAs(imagePath);
        const image = fs.readFileSync(imagePath);
        check('downloaded file has a PNG signature and a 2× portrait canvas', image.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && image.readUInt32BE(16) === 1200 && image.readUInt32BE(20) > 650);
        const exportData = await page.evaluate(() => window.qaExport);
        const exportText = exportData.text.replace(/\u00a0/g, ' ');
        check('PNG stage has the full READY scenario, zero controls and no UI badge', exportData.controls === 0 && !/По примеру|По ссылке/.test(exportText)
            && ['150 000 ₽', '100 000 ₽', '213', '28,4', '7,5 ч × 3,5 дн.', '2,5 дн.', '60 мин в одну сторону', '1,5 ч/нед.', '6,5 ч в месяц'].every(value => exportText.includes(value)));
        await page.locator('[data-screenshot-stage]').waitFor({ state: 'detached' });
        check('export does not mutate the live result', await page.locator('#results-card').innerText() === beforePng);

        await page.evaluate(() => {
            document.querySelector('#toast-message').textContent = '';
            Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
        });
        await page.locator('#share-time').click();
        const dialog = page.locator('#time-share-dialog');
        await dialog.waitFor();
        const share = page.locator('#time-share-url');
        const link = new URL(await share.inputValue());
        check('Clipboard rejection opens a selected manual link without false success', await share.evaluate(input => input.selectionStart === 0 && input.selectionEnd === input.value.length)
            && !/скопирована/i.test(await page.locator('#toast-message').textContent()) && link.searchParams.get('unpaid') === '1.5');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        check('copy leaves URL and attribution unchanged and deduplicates goals', page.url() === url + '?utm_source=synthetic&utm_medium=cpc&yclid=qa'
            && (await goals(page)).length === 1 && (await goals(page))[0].length === 3);
        requests.length = 0;
        const previous = origin + pagePath + '?price=111222&income=333444&utm_medium=referral';
        const historyLength = await page.evaluate(() => history.length);
        await page.goto(link.href + '&utm_source=share&utm_campaign=qa&ref=valid#retained', { referer: previous });
        await page.waitForFunction(() => document.body.dataset.calculationState === 'READY');
        const init = await page.evaluate(() => window.qaInit[0]);
        check('old share link restores fractionals and uses replaceState before Metrika init', await hours(page) === '213'
            && init.href === url + '?utm_source=share&utm_campaign=qa&ref=valid#retained'
            && init.args[2].url === init.href && init.history === historyLength + 1 && (await goals(page)).length === 0
            && await page.locator('#scenario-badge').innerText() === 'По ссылке');
        check('explicit analytics referrer drops scenario parameters but retains referral attribution',
            init.args[2].referrer === url + '?utm_medium=referral');
        const resourceRequests = requests.filter(request => !request.isNavigationRequest());
        const referers = await Promise.all(resourceRequests.map(async request => (await request.allHeaders()).referer || ''));
        check('no subresource Referer exposes financial keys, including CDN and Метрика tag', resourceRequests.some(request => request.url().includes('mc.yandex.ru'))
            && resourceRequests.some(request => request.url().includes('cdnjs.cloudflare.com'))
            && referers.every(ref => !ref || financialKeys.every(key => !new URL(ref).searchParams.has(key))));
        await page.goto(standardShare.href);
        check('standard shared scenario reopens at 299 hours without a conversion', await hours(page) === '299' && (await goals(page)).length === 0);
        await page.goto(copied);
        check('remote shared scenario reopens at 260 hours without a conversion or commute',
            await hours(page) === '260' && await page.locator('#commute-input').isHidden() && (await goals(page)).length === 0);
        check('no uncaught browser errors', errors.length === 0);
        await context.close();
        fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify({
            browser: browser.version(), baseline: process.env.TIME_PRODUCTION_HTML ? 'production HTML served locally' : baselineRef,
            checks, comparison, contrast, errors
        }, null, 2) + '\n');
    } finally {
        await browser?.close();
        server.close();
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
