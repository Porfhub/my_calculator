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

test('service worker cache is advanced with the shared export behaviour', () => {
    assert.match(read('sw.js'), /fin-hub-cache-v8/);
    assert.match(read('sw.js'), /'\/js\/trust-layer\.js'/);
    assert.match(read('sw.js'), /'\/js\/ui-utils\.js'/);
});
