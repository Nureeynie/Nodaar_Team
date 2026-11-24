import asyncio, json, sys, os
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8099"
OUT = "/tmp/shots"
os.makedirs(OUT, exist_ok=True)

ADMIN_EMAIL = "nodaarltd@gmail.com"
ADMIN_PASS = "Nodaar@2026"

async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await browser.new_context(viewport={"width": 1440, "height": 1000})
        page = await ctx.new_page()
        page.on("console", lambda m: errors.append(f"[console.{m.type}] {m.text}") if m.type in ("error","warning") else None)
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

        await page.goto(f"{BASE}/app.html", wait_until="networkidle")
        await page.screenshot(path=f"{OUT}/01-login.png")
        print("TITLE:", await page.title())

        # login
        await page.fill("#li-email", ADMIN_EMAIL)
        await page.fill("#li-pass", ADMIN_PASS)
        await page.click("#login-form button[type=submit]")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/02-after-login.png")
        print("AUTH hidden:", await page.is_hidden("#ds-auth"))
        print("APP visible:", await page.is_visible("#ds-app"))
        print("TITLE now:", await page.inner_text("#page-title"))

        # switch to admin role
        admin_btn = page.locator("#role-admin-btn")
        if await admin_btn.is_visible():
            await admin_btn.click()
            await page.wait_for_timeout(2500)
            await page.screenshot(path=f"{OUT}/03-admin-dashboard.png")
            print("ADMIN TITLE:", await page.inner_text("#page-title"))

        routes = ["dashboard","review","users","units","tasks","meetings","ideas","scores","calendar","library","channels","report"]
        for r in routes:
            try:
                await page.evaluate(f"window.DS.navigate('{r}')")
                await page.wait_for_timeout(2200)
                await page.screenshot(path=f"{OUT}/admin-{r}.png", full_page=True)
                title = await page.inner_text("#page-title")
                body = await page.inner_text("#ds-view")
                err = "Something went wrong" in body
                print(f"ROUTE {r}: title={title!r} len={len(body)} {'*** ERROR ***' if err else 'ok'}")
                if err:
                    print("   >", body[:400].replace("\n"," | "))
            except Exception as e:
                print(f"ROUTE {r}: EXCEPTION {e}")

        # mobile view — fresh context so it starts at the login screen
        mctx = await browser.new_context(viewport={"width": 390, "height": 844})
        mp = await mctx.new_page()
        mp.on("pageerror", lambda e: errors.append(f"[mobile.pageerror] {e}"))
        await mp.goto(f"{BASE}/app.html", wait_until="networkidle")
        await mp.wait_for_selector("#li-email", timeout=15000)
        await mp.fill("#li-email", ADMIN_EMAIL)
        await mp.fill("#li-pass", ADMIN_PASS)
        await mp.click("#login-form button[type=submit]")
        await mp.wait_for_timeout(4000)
        await mp.screenshot(path=f"{OUT}/m-01-member-dashboard.png", full_page=True)
        print("MOBILE TITLE:", await mp.inner_text("#page-title"))
        print("MOBILE tabbar visible:", await mp.is_visible("#ds-tabbar"))
        for r in ["report","tasks","scores","library"]:
            await mp.evaluate(f"window.DS.navigate('{r}')")
            await mp.wait_for_timeout(1800)
            await mp.screenshot(path=f"{OUT}/m-{r}.png", full_page=True)
        print("MOBILE routes done")

        await browser.close()

    print("\n=== CONSOLE/PAGE ERRORS ===")
    for e in errors[:60]:
        print(e)
    if not errors:
        print("(none)")

asyncio.run(main())
