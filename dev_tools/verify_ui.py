from playwright.sync_api import sync_playwright
import time

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 1080})

        pages = [
            'index.html',
            'mortgage.html',
            'wealth.html',
            'inflation-shredder.html',
            'car-vs-taxi.html',
            'time-is-money.html',
            'millionaire.html'
        ]

        for p_name in pages:
            url = f"http://localhost:8000/{p_name}"
            print(f"Processing {url}...")
            try:
                page.goto(url)
                page.wait_for_load_state("networkidle")
                time.sleep(1)

                # Light mode
                page.screenshot(path=f"/home/jules/verification/screenshot_{p_name}_light.png")

                # Switch to dark mode
                page.evaluate("""() => {
                    const btn = document.querySelector('button[onclick*="toggleDarkMode"]');
                    if (btn) {
                        btn.click();
                    } else if (typeof toggleDarkMode === 'function') {
                        toggleDarkMode();
                    } else {
                        document.documentElement.classList.add('dark');
                    }
                }""")
                time.sleep(0.5)
                page.screenshot(path=f"/home/jules/verification/screenshot_{p_name}_dark.png")
            except Exception as e:
                print(f"Error processing {p_name}: {e}")

        browser.close()

if __name__ == "__main__":
    run_verification()
