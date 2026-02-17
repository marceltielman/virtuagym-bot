import "dotenv/config";
import { DateTime } from "luxon";
import { chromium } from "playwright";

const ZONE = "Europe/Amsterdam";

const CFG = {
  baseUrl: process.env.VG_LOGIN_URL,
  weekQuery: process.env.VG_WEEK_QUERY || "",
  className: process.env.VG_CLASS_NAME,
  classTime: process.env.VG_CLASS_TIME,
  testMode: process.env.VG_TEST_MODE === "1",
  // storageStatePath: process.env.VG_STORAGE_STATE || "storageState.json",
  storageStatePath: "storageState.json",
};

function assertEnv() {
  const missing = [];
  if (!CFG.baseUrl) missing.push("VG_LOGIN_URL");
  if (!CFG.className) missing.push("VG_CLASS_NAME");
  if (!CFG.classTime) missing.push("VG_CLASS_TIME");
  if (missing.length) {
    console.error("Missing env vars:", missing.join(", "));
    process.exit(1);
  }
}

function withinAmsterdamWindow() {
  console.log("is test mode?", CFG.testMode, process.env.VG_TEST_MODE);

  if (CFG.testMode) return true;

  const now = DateTime.now().setZone(ZONE);

  // Monday
  if (now.weekday !== 1) return false;

  // Window 20:01–20:03
  const minutes = now.hour * 60 + now.minute;
  const start = 20 * 60 + 1;
  const end = 20 * 60 + 3;

  return minutes >= start && minutes <= end;
}

function shouldRunNowAmsterdam() {
  console.log("is test mode?", CFG.testMode, process.env.VG_TEST_MODE);

  if (CFG.testMode) return true;
  const now = DateTime.now().setZone(ZONE);
  return now.weekday === 1 && now.toFormat("HH:mm") === "20:01"; // Monday 20:01
}


function computeTargetMondayAndWeekUrl() {
  const now = DateTime.now().setZone(ZONE);

  // We draaien maandag 20:01 → target is maandag volgende week
  const targetMonday = now.plus({ weeks: 1 }).startOf("week"); // Monday next week

  // Jouw Virtuagym week URL lijkt “anchored” per zaterdag:
  // /classes/week/2026-02-14 -> /classes/week/2026-02-21 -> etc
  // Daarom: anchor = zaterdag van die week = maandag + 5 dagen
  const anchorSaturdayISO = targetMonday.plus({ days: 5 }).toISODate();

  const weekUrl = `${CFG.baseUrl}/classes/week/${anchorSaturdayISO}${CFG.weekQuery}`;

  // DOM class is internal-event-day-DD-MM-YYYY
  const dayClass = `internal-event-day-${targetMonday.toFormat("dd-MM-yyyy")}`;

  return { now, targetMonday, dayClass, weekUrl };
}

async function takeShot(page, name) {
  try {
    await page.screenshot({ path: name, fullPage: true });
  } catch { }
}

(async () => {
  assertEnv();

  if (!withinAmsterdamWindow()) {
    const now = DateTime.now().setZone(ZONE);

    console.log(`Skip: now=${now.toFormat("cccc HH:mm")} (${ZONE}), outside window`);
    process.exit(0);
  }

  const now = DateTime.now().setZone(ZONE);
  const target = now.set({ hour: 20, minute: 1, second: 0, millisecond: 0 });

  // Alleen wachten als we vóór 20:01 zitten
  if (now < target) {
    const ms = target.diff(now).as("milliseconds");

    const sleepMs = Math.min(ms, 10 * 60 * 1000);

    console.log(`⏳ Waiting ${Math.round(sleepMs / 1000)}s until booking time`);
    await new Promise(r => setTimeout(r, sleepMs));
  }

  const { targetMonday, dayClass, weekUrl } = computeTargetMondayAndWeekUrl();

  console.log("Target Monday:", targetMonday.toISODate(), targetMonday.toFormat("cccc"));
  console.log("Week URL:", weekUrl);
  console.log("Day class:", dayClass);
  console.log("Class:", CFG.className, "|", CFG.classTime);

  const browser = await chromium.launch({
    headless: true,
    // Voor lokaal debuggen kun je dit gebruiken:
    // headless: false, slowMo: 150
  });

  const context = await browser.newContext({
    storageState: CFG.storageStatePath,
  });

  const page = await context.newPage();

  try {
    // 1) Open de target week direct
    await page.goto(weekUrl, { waitUntil: "networkidle" });
    await page.waitForSelector("#agenda", { timeout: 15000 });

    // 2) Vind exact de juiste tile (datum + classname + time)
    // NB: :has() en :text-is() zijn Playwright selector extensions
    const tile = page.locator(
      `#schedule_content .class.${dayClass}:has(span.classname:text-is("${CFG.className}")):has(span.time:text-is("${CFG.classTime}"))`
    ).first();

    if (!(await tile.count())) {
      await takeShot(page, "not-found.png");
      throw new Error("Class tile not found. Check VG_CLASS_NAME / VG_CLASS_TIME exact match.");
    }

    // 3) Als FULL → stop
    const fullLabelCount = await tile.locator("div.full", { hasText: "FULL" }).count();
    const hasClassFull = await tile.evaluate(el => el.classList.contains("class_full"));

    if (fullLabelCount > 0 || hasClassFull) {
      await takeShot(page, "full.png");
      console.log("⚠️ Class is FULL (or class_full). Skipping booking.");
      process.exit(0);
    }

    // 4) Open modal
    await tile.click();

    const cancelBtn = page.locator('text=Cancel booking');

    if (await cancelBtn.count()) {
      console.log("Already booked — exiting.");
      process.exit(0);
    }

    // 5) Wacht op modal / booking knop
    // const bookBtn = page.getByRole("button", { name: /reserveer|book|inschrijven|aanmelden/i });
    const bookBtn = page.locator("#book_btn");
    await bookBtn.first().waitFor({ timeout: 15000 });

    // 6) Klik book
    await bookBtn.first().click();
    await page.waitForTimeout(1500);

    await takeShot(page, "after-book.png");
    console.log("✅ Booking clicked.");
  } catch (e) {
    console.error("❌ Error:", e?.message || e);
    await takeShot(page, "error.png");
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();