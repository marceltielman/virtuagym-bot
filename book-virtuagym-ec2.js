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
  storageStatePath: "storageState.json",
};

/* ── helpers ─────────────────────────────────────────────────────── */

function ts() {
  return DateTime.now().setZone(ZONE).toFormat("yyyy-MM-dd HH:mm:ss");
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

function logError(...args) {
  console.error(`[${ts()}]`, ...args);
}

/* ── env check ───────────────────────────────────────────────────── */

function assertEnv() {
  const missing = [];
  if (!CFG.baseUrl) missing.push("VG_LOGIN_URL");
  if (!CFG.className) missing.push("VG_CLASS_NAME");
  if (!CFG.classTime) missing.push("VG_CLASS_TIME");
  if (missing.length) {
    logError("Missing env vars:", missing.join(", "));
    process.exit(1);
  }
}

/* ── booking window: Mon 20:00–20:03 AMS ─────────────────────── */

function withinAmsterdamWindow() {
  if (CFG.testMode) return true;

  const now = DateTime.now().setZone(ZONE);
  if (now.weekday !== 1) return false;

  const minutes = now.hour * 60 + now.minute;
  const start = 20 * 60;     // 20:00
  const end = 20 * 60 + 3;   // 20:03

  return minutes >= start && minutes <= end;
}

/* ── target week URL ─────────────────────────────────────────────── */

function computeTargetMondayAndWeekUrl() {
  const now = DateTime.now().setZone(ZONE);

  // We run Monday 20:00 → target is Monday next week
  const targetMonday = now.plus({ weeks: 1 }).startOf("week");

  // Virtuagym week URL is anchored on Saturday (Monday + 5)
  const anchorSaturdayISO = targetMonday.plus({ days: 5 }).toISODate();

  const weekUrl = `${CFG.baseUrl}/classes/week/${anchorSaturdayISO}${CFG.weekQuery}`;

  // DOM class: internal-event-day-DD-MM-YYYY
  const dayClass = `internal-event-day-${targetMonday.toFormat("dd-MM-yyyy")}`;

  return { now, targetMonday, dayClass, weekUrl };
}

/* ── main ────────────────────────────────────────────────────────── */

(async () => {
  assertEnv();

  if (!withinAmsterdamWindow()) {
    const now = DateTime.now().setZone(ZONE);
    log(`Skip: now=${now.toFormat("cccc HH:mm")} (${ZONE}), outside window`);
    process.exit(0);
  }

  // Sleep until 20:00 AMS
  const now = DateTime.now().setZone(ZONE);
  const target = now.set({ hour: 20, minute: 0, second: 0, millisecond: 0 });

  if (now < target && !CFG.testMode) {
    const ms = target.diff(now).as("milliseconds");
    const sleepMs = Math.min(ms, 10 * 60 * 1000);
    log(`Waiting ${Math.round(sleepMs / 1000)}s until 20:00`);
    await new Promise(r => setTimeout(r, sleepMs));
  }

  const { targetMonday, dayClass, weekUrl } = computeTargetMondayAndWeekUrl();

  log("Target Monday:", targetMonday.toISODate(), targetMonday.toFormat("cccc"));
  log("Week URL:", weekUrl);
  log("Day class:", dayClass);
  log("Class:", CFG.className, "|", CFG.classTime);

  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    storageState: CFG.storageStatePath,
  });

  const page = await context.newPage();

  try {
    // 1) Open the target week
    await page.goto(weekUrl, { waitUntil: "networkidle" });
    
    const needToLogin = await page.locator('#navbar .btn-login').count() > 0;

    if (needToLogin) {
      log("Not logged in. Please log in manually and save storage state.");
      throw new Error("Not logged in. Please log in manually and save storage state.");
    }
    await page.waitForSelector("#agenda", { timeout: 15000 });

    // 2) Find the exact tile (date + classname + time)
    const tile = page.locator(
      `#schedule_content .class.${dayClass}:has(span.classname:text-is("${CFG.className}")):has(span.time:text-is("${CFG.classTime}"))`
    ).first();

    if (!(await tile.count())) {
      throw new Error("Class tile not found. Check VG_CLASS_NAME / VG_CLASS_TIME exact match.");
    }

    // 3) If FULL → stop
    const fullLabelCount = await tile.locator("div.full", { hasText: "FULL" }).count();
    const hasClassFull = await tile.evaluate(el => el.classList.contains("class_full"));

    if (fullLabelCount > 0 || hasClassFull) {
      log("Class is FULL (or class_full). Skipping booking.");
      process.exit(0);
    }

    // 4) Open modal
    await tile.click();

    const cancelBtn = page.locator('text=Cancel booking');

    if (await cancelBtn.count()) {
      log("Already booked — exiting.");
      process.exit(0);
    }

    // 5) Wait for booking button
    const bookBtn = page.locator("#book_btn");
    await bookBtn.first().waitFor({ timeout: 15000 });

    // 6) Click book
    await bookBtn.first().click();
    await page.waitForTimeout(1500);

    log("Booking clicked.");
  } catch (e) {
    logError("Error:", e?.message || e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
