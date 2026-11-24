"""End-to-end flow: admin creates a user -> first login forces password change ->
member submits a daily report -> admin reviews and scores it -> member sees the score."""
import asyncio, os, re, sys
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:8099"
OUT = "/tmp/shots/e2e"
os.makedirs(OUT, exist_ok=True)
ADMIN = ("nodaarltd@gmail.com", "Nodaar@2026")
NEW_EMAIL = "flow.tester." + __import__("uuid").uuid4().hex[:10] + "@nodaar.com"
NEW_PASS = "TempPass2026"
NEW_NAME = "Flow Tester"
errors = []

async def login(page, email, pw):
    await page.goto(f"{BASE}/app.html", wait_until="networkidle")
    await page.wait_for_selector("#li-email", timeout=15000)
    await page.fill("#li-email", email)
    await page.fill("#li-pass", pw)
    await page.click("#login-form button[type=submit]")
    await page.wait_for_timeout(3500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width":1440,"height":1000})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))

        # ── 1. ADMIN creates the user ──────────────────────────
        await login(page, *ADMIN)
        await page.locator("#role-admin-btn").click()
        await page.wait_for_timeout(2000)
        await page.evaluate("window.DS.navigate('users')")
        await page.wait_for_timeout(2000)
        await page.fill("#nu-name", NEW_NAME)
        await page.fill("#nu-email", NEW_EMAIL)
        await page.fill("#nu-pass", NEW_PASS)
        await page.screenshot(path=f"{OUT}/1-create-user.png", full_page=True)
        await page.click("#nu-form button[type=submit]")
        await page.wait_for_timeout(6000)
        await page.screenshot(path=f"{OUT}/2-user-created.png", full_page=True)
        body = await page.inner_text("#ds-view")
        print("STEP1 create user:", "OK" if NEW_NAME in body else "*** MISSING ***")
        print("   toast/page text snippet:", body[:200].replace("\n"," | "))

        # verify the profile row exists
        await page.evaluate("window.DS.navigate('users')")
        await page.wait_for_timeout(2500)
        body = await page.inner_text("#ds-view")
        print("STEP1 user in table:", "OK" if NEW_EMAIL in body else "*** NOT FOUND ***")

        # ── 2. NEW USER first login -> forced password change ──
        ctx2 = await b.new_context(viewport={"width":1440,"height":1000})
        p2 = await ctx2.new_page()
        p2.on("pageerror", lambda e: errors.append(f"[p2 pageerror] {e}"))
        await login(p2, NEW_EMAIL, NEW_PASS)
        pw_open = await p2.is_visible("#pw-modal.open")
        print("STEP2 forced password modal shown:", "OK" if pw_open else "*** NOT SHOWN ***")
        await p2.screenshot(path=f"{OUT}/3-forced-password.png", full_page=True)
        newpw = "ChosenByFlow2026"
        await p2.fill("#pw1", newpw)
        await p2.fill("#pw2", newpw)
        await p2.click("#pw-form button[type=submit]")
        await p2.wait_for_timeout(3000)
        still_open = await p2.is_visible("#pw-modal.open")
        print("STEP2 modal closed after change:", "OK" if not still_open else "*** STILL OPEN ***")
        await p2.screenshot(path=f"{OUT}/4-after-pw-change.png", full_page=True)

        # ── 3. MEMBER submits a daily report ──────────────────
        await p2.evaluate("window.DS.navigate('report')")
        await p2.wait_for_timeout(2200)
        await p2.fill("#dr-done", "Drafted the supplier onboarding checklist and walked two suppliers through it.")
        await p2.fill("#dr-plan", "Send the checklist to the last three suppliers and collect signatures.")
        await p2.fill("#dr-block", "Waiting on the logistics team to confirm the delivery window format.")
        await p2.fill("#dr-ev", "https://docs.google.com/document/d/onboarding-checklist")
        await p2.screenshot(path=f"{OUT}/5-member-report-form.png", full_page=True)
        await p2.click("#dr-form button[type=submit]")
        await p2.wait_for_timeout(3500)
        pbody = await p2.inner_text("#ds-view")
        print("STEP3 report submitted:", "OK" if "Submitted" in pbody else "*** NOT SUBMITTED ***")
        print("   text:", pbody[:250].replace("\n"," | "))
        await p2.screenshot(path=f"{OUT}/6-member-report-submitted.png", full_page=True)

        # ── 4. ADMIN reviews and scores it ─────────────────────
        await page.evaluate("window.DS.navigate('review')")
        await page.wait_for_timeout(2800)
        rbody = await page.inner_text("#ds-view")
        print("STEP4 item in review queue:", "OK" if NEW_NAME in rbody else "*** NOT IN QUEUE ***")
        await page.screenshot(path=f"{OUT}/7-review-queue.png", full_page=True)

        # open the new user's item
        opened = False
        for row in await page.query_selector_all("#rq-list .row"):
            if NEW_NAME in (await row.inner_text()):
                btn = await row.query_selector("[data-open]")
                await btn.click()
                opened = True
                break
        print("STEP4 opened review modal:", "OK" if opened else "*** COULD NOT OPEN ***")
        await page.wait_for_timeout(2200)
        score_val = await page.input_value("#rv-score")
        print("STEP4 score field starts EMPTY:", "OK" if score_val == "" else f"*** PREFILLED {score_val!r} ***")
        modal_text = await page.inner_text("#modal-box")
        print("STEP4 late flag present:", "yes" if "Late by" in modal_text else "no (on-time report)")
        await page.screenshot(path=f"{OUT}/8-review-modal-empty-score.png", full_page=True)

        # try approving with empty score -> must be blocked
        await page.click("#rv-save")
        await page.wait_for_timeout(1200)
        err_txt = await page.eval_on_selector("#rv-score-err", "e => e.textContent") if await page.query_selector("#rv-score-err") else ""
        err_vis = await page.eval_on_selector("#rv-score-err", "e => e.classList.contains('show')") if await page.query_selector("#rv-score-err") else False
        print("STEP4 empty score blocked:", "OK" if (err_txt.strip() and err_vis) else "*** NOT BLOCKED ***", "|", err_txt, "| visible:", err_vis)
        await page.screenshot(path=f"{OUT}/9-score-validation.png", full_page=True)

        # now score it
        await page.fill("#rv-score", "84")
        await page.fill("#rv-note", "Clear checklist and good follow-through with suppliers.")
        await page.click("#rv-save")
        await page.wait_for_timeout(3500)
        await page.screenshot(path=f"{OUT}/10-approved.png", full_page=True)

        # ── 5. MEMBER sees the score ───────────────────────────
        await p2.evaluate("window.DS.navigate('scores')")
        await p2.wait_for_timeout(2800)
        sbody = await p2.inner_text("#ds-view")
        print("STEP5 member sees 84:", "OK" if "84" in sbody else "*** SCORE NOT VISIBLE ***")
        print("   member score text:", sbody[:400].replace("\n"," | "))
        await p2.screenshot(path=f"{OUT}/11-member-score-sheet.png", full_page=True)

        # privacy: member must not see other members
        print("STEP5 no other member data:", "OK" if "Muhammad" not in sbody and "Abdulkarim" not in sbody else "*** LEAK ***")

        await b.close()
    print("\n=== ERRORS ===")
    print("\n".join(errors) if errors else "(none)")

asyncio.run(main())
