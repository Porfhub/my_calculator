const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const calculatorControllers = {
    'inflation-shredder.html': 'shredderStateController',
    'financial-freedom.html': 'freedomStateController',
    'millionaire.html': 'millionaireStateController',
    'genetic-wealth.html': 'geneticStateController',
    'honest-credit.html': 'honestCreditStateController',
    'mortgage.html': 'mortgageStateController',
    'rent-vs-mortgage.html': 'rentStateController',
    'time-is-money.html': 'timeStateController'
};

test('stateful calculators allow exports only for the same ready result shown to the user', () => {
    for (const [file, controller] of Object.entries(calculatorControllers)) {
        const html = read(file);
        assert.match(html, new RegExp(`window\\.canExportCalculation\\s*=\\s*\\(\\)\\s*=>\\s*${controller}\\.getState\\(\\)\\s*===\\s*CalculatorState\\.STATES\\.READY`), file);
    }
});

test('shared share and screenshot actions fail closed when a page marks its calculation unavailable', () => {
    const utilities = read('js/ui-utils.js');
    assert.match(utilities, /function canExportCurrentCalculation\(\)/);
    assert.match(utilities, /async function takeScreenshot[\s\S]*?if \(!canExportCurrentCalculation\(\)\) return;/);
    assert.match(utilities, /function shareLink\(\)\s*\{\s*if \(!canExportCurrentCalculation\(\)\) return;/);
    assert.match(utilities, /function shareLinkCustom\(title, text\)\s*\{\s*if \(!canExportCurrentCalculation\(\)\) return;/);
});

test('every production calculator exposes the shared screenshot export without replacing it', () => {
    const screenshotPages = {
        'mortgage.html': ['screenshot-area', 'yasnomera-mortgage-calculation.png'],
        'wealth.html': ['screenshot-area', 'yasnomera-income-comparison.png'],
        'rent-vs-mortgage.html': ['screenshot-area', 'yasnomera-rent-vs-mortgage.png'],
        'time-is-money.html': ['results-card', 'yasnomera-time-is-money.png'],
        'inflation-shredder.html': ['screenshot-area', 'yasnomera-inflation-report.png'],
        'car-vs-taxi.html': ['screenshot-area', 'yasnomera-car-vs-taxi.png'],
        'millionaire.html': ['screenshot-area', 'yasnomera-financial-goal.png'],
        'financial-freedom.html': ['screenshot-area', 'yasnomera-financial-freedom.png'],
        'honest-credit.html': ['screenshot-area', 'yasnomera-honest-credit-cost.png'],
        'genetic-wealth.html': ['screenshot-area', 'yasnomera-child-cost.png']
    };

    for (const [file, [elementId, filename]] of Object.entries(screenshotPages)) {
        const html = read(file);
        assert.match(html, new RegExp(`onclick="takeScreenshot\\('${elementId}', '${filename}'\\)"`), file);
        assert.match(html, /html2canvas\.min\.js/, file);
        assert.doesNotMatch(html, /window\.takeScreenshot\s*=/, file);
    }
});

test('screenshot export uses an isolated, capture-safe result clone', () => {
    const utilities = read('js/ui-utils.js');
    assert.match(utilities, /function createScreenshotStage\(source\)/);
    assert.match(utilities, /copyCanvasContents\(source, clone\)/);
    assert.match(utilities, /SCREENSHOT_EXCLUDED_SELECTORS/);
    assert.match(utilities, /clone\.querySelectorAll\(SCREENSHOT_EXCLUDED_SELECTORS\)/);
    assert.match(utilities, /downloadScreenshot\(blob, filename\)/);
    assert.doesNotMatch(utilities, /console\.error\('Screenshot/);
});

test('financial freedom tooltip styles stay inside the mobile viewport', () => {
    const html = read('financial-freedom.html');
    assert.match(html, /@media \(max-width: 639px\)[\s\S]*?\.tooltip \.tooltiptext[\s\S]*?position: fixed;[\s\S]*?right: 1rem;[\s\S]*?left: 1rem;/);
});

test('service worker cache is advanced with the shared export behaviour', () => {
    assert.match(read('sw.js'), /yasnomera-cache-v16/);
    assert.match(read('sw.js'), /'\/js\/trust-layer\.js'/);
    assert.match(read('sw.js'), /'\/js\/ui-utils\.js'/);
});

test('every product page loads the shared interaction and responsive polish layer', () => {
    const pages = [
        'index.html',
        'mortgage.html',
        'wealth.html',
        'rent-vs-mortgage.html',
        'time-is-money.html',
        'inflation-shredder.html',
        'car-vs-taxi.html',
        'millionaire.html',
        'financial-freedom.html',
        'honest-credit.html',
        'genetic-wealth.html'
    ];

    for (const page of pages) {
        const html = read(page);
        assert.match(html, /<link rel="stylesheet" href="css\/product-polish\.css">/, page);
        assert.match(html, /<button[^>]*id="theme-toggle"[^>]*aria-label="Переключить тему"/, page);
    }

    assert.match(read('sw.js'), /'\/css\/product-polish\.css'/);
});

test('state-managed calculators keep fixed mobile results hidden until a valid result exists', () => {
    const stateMachine = read('js/calculator-state.js');
    const polish = read('css/product-polish.css');

    assert.match(stateMachine, /document\.body\.classList\.add\('calculation-state-managed'\)/);
    assert.match(stateMachine, /document\.body\.dataset\.calculationState = nextState/);
    assert.match(polish, /\.calculation-state-managed:not\(\[data-calculation-state="READY"\]\) \.mobile-sticky-results/);
});

test('shared polish respects reduced-motion preferences and provides visible keyboard focus', () => {
    const polish = read('css/product-polish.css');
    assert.match(polish, /prefers-reduced-motion: reduce/);
    assert.match(polish, /:focus-visible/);
});
