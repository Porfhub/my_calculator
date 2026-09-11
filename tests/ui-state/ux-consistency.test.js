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

test('affected pages do not expose an unstable screenshot export control', () => {
    const screenshotPages = [
        'rent-vs-mortgage.html',
        'inflation-shredder.html',
        'car-vs-taxi.html',
        'time-is-money.html'
    ];

    for (const file of screenshotPages) {
        const html = read(file);
        assert.doesNotMatch(html, /onclick="takeScreenshot\(/, file);
        assert.doesNotMatch(html, /window\.takeScreenshot\s*=/, file);
    }
});

test('financial freedom tooltip styles stay inside the mobile viewport', () => {
    const html = read('financial-freedom.html');
    assert.match(html, /@media \(max-width: 639px\)[\s\S]*?\.tooltip \.tooltiptext[\s\S]*?position: fixed;[\s\S]*?right: 1rem;[\s\S]*?left: 1rem;/);
});

test('service worker cache is advanced with the shared export behaviour', () => {
    assert.match(read('sw.js'), /yasnomera-cache-v15/);
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
