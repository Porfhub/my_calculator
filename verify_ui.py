import asyncio
from playwright.async_api import async_playwright

async def capture_screenshots():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        pages = [
            ("hub", "http://localhost:8000/index.html"),
            ("inflation", "http://localhost:8000/inflation-shredder.html"),
            ("car", "http://localhost:8000/car-vs-taxi.html")
        ]

        # Desktop
        await page.set_viewport_size({"width": 1280, "height": 1000})
        for name, url in pages:
            await page.goto(url)
            await page.wait_for_timeout(1000) # Wait for animations/charts
            await page.screenshot(path=f"{name}_desktop.png", full_page=True)

        # Mobile
        await page.set_viewport_size({"width": 375, "height": 812})
        for name, url in pages:
            await page.goto(url)
            await page.wait_for_timeout(1000)
            await page.screenshot(path=f"{name}_mobile.png", full_page=True)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(capture_screenshots())
