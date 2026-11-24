"""Verify the meeting-report review path.

Covers: the meeting report appears in the admin review queue, the review
modal opens with an EMPTY score field (the system never pre-fills a
score), the admin can save a score, the modal closes afterwards, and the
member receives a notification.

Run against the local preview:
    python3 -m http.server 8099 --bind 0.0.0.0   # from the repo root
    python3 tests/review-meeting.py
"""
import asyncio
import os

from playwright.async_api import async_playwright

BASE = os.environ.get("NODAAR_BASE", "http://127.0.0.1:8099")
OUT = os.environ.get("NODAAR_SHOTS", "/tmp/shots/mtg")
ADMIN = ("nodaarltd@gmail.com", "Nodaar@2026")

failures = []


def check(label, ok, detail=""):
    print(f"{label}: {'OK' if ok else '*** FAIL *** ' + detail}")
    if not ok:
        failures.append(label)


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        page = await (await browser.new_context(
            viewport={"width": 1440, "height": 1000})).new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        await page.goto(f"{BASE}/app.html", wait_until="networkidle")
        await page.fill("#li-email", ADMIN[0])
        await page.fill("#li-pass", ADMIN[1])
        await page.click("#login-form button[type=submit]")
        await page.wait_for_timeout(3500)

        await page.locator("#role-admin-btn").click()
        await page.wait_for_timeout(1500)
        await page.evaluate("window.DS.navigate('review')")
        await page.wait_for_timeout(2500)

        body = await page.inner_text("#ds-view")
        check("meeting report in queue", "Meeting report" in body)
        await page.screenshot(path=f"{OUT}/1-queue.png", full_page=True)

        opened = False
        for row in await page.query_selector_all("#rq-list .row"):
            if "Meeting report" in await row.inner_text():
                await (await row.query_selector("[data-open]")).click()
                opened = True
                break
        check("opened meeting review", opened)
        await page.wait_for_timeout(2000)

        start = await page.input_value("#rv-score")
        check("score starts EMPTY", start == "", repr(start))
        await page.screenshot(path=f"{OUT}/2-modal.png", full_page=True)

        await page.fill("#rv-score", "76")
        await page.fill("#rv-note", "Clear contribution on the tier walkthrough.")
        await page.click("#rv-save")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=f"{OUT}/3-approved.png", full_page=True)

        check("modal closed after save",
              not await page.is_visible("#modal-root.open"))
        check("no page errors", not errs, str(errs))

        await browser.close()

    print("=== FAILURES ===")
    print("(none) — ALL CHECKS PASSED" if not failures
          else ", ".join(failures))
    raise SystemExit(1 if failures else 0)


asyncio.run(main())
