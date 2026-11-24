import asyncio, os
from playwright.async_api import async_playwright
BASE = "http://127.0.0.1:8099"
os.makedirs("/tmp/shots", exist_ok=True)

async def main():
    fails = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width":1440,"height":1000})
        page = await ctx.new_page()
        async def on_resp(r):
            if r.status >= 400 and "supabase" in r.url:
                body = ""
                try: body = (await r.text())[:500]
                except Exception: pass
                fails.append(f"{r.status} {r.request.method} {r.url}\n    {body}")
        page.on("response", on_resp)
        await page.goto(f"{BASE}/app.html", wait_until="networkidle")
        await page.fill("#li-email","nodaarltd@gmail.com")
        await page.fill("#li-pass","Nodaar@2026")
        await page.click("#login-form button[type=submit]")
        await page.wait_for_timeout(3500)
        await page.locator("#role-admin-btn").click()
        await page.wait_for_timeout(2000)
        for r in ["dashboard","review","users","units","tasks","meetings","ideas","scores","calendar","library","channels","report"]:
            await page.evaluate(f"window.DS.navigate('{r}')")
            await page.wait_for_timeout(2000)
        await b.close()
    print("=== FAILED REQUESTS ===")
    seen=set()
    for f in fails:
        key=f.split("\n")[0]
        if key in seen: continue
        seen.add(key); print(f); print()
    if not fails: print("(none)")

asyncio.run(main())
