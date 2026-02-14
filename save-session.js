import "dotenv/config";
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 150 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(process.env.VG_LOGIN_URL, { waitUntil: "domcontentloaded" });

  console.log("➡️ Log nu handmatig in (incl. reCAPTCHA) en blijf ingelogd.");
  console.log("➡️ Als je het rooster ziet, wordt de sessie opgeslagen.");

  // Wacht tot je ingelogd bent (agenda zichtbaar)
  await page.waitForSelector("#agenda", { timeout: 5 * 60 * 1000 });

  await context.storageState({ path: "storageState.json" });
  console.log("✅ storageState.json opgeslagen");

  await browser.close();
})();