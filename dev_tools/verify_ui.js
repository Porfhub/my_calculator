const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 1080 });

  const pages = [
    'index.html',
    'mortgage.html',
    'wealth.html',
    'inflation-shredder.html',
    'car-vs-taxi.html',
    'time-is-money.html'
  ];

  for (const p of pages) {
    await page.goto('http://localhost:8000/' + p);
    await page.waitForTimeout(1000);

    // Light mode
    await page.screenshot({ path: `screenshot_${p}_light.png`, fullPage: false });

    // Switch to dark mode (if toggle exists and works as intended)
    await page.evaluate(() => {
        if (typeof toggleDarkMode === 'function') {
            toggleDarkMode();
        } else {
            document.documentElement.classList.add('dark');
        }
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `screenshot_${p}_dark.png`, fullPage: false });
  }

  await browser.close();
})();
