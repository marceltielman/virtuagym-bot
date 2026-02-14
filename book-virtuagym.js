import "dotenv/config";
import { DateTime } from "luxon";

const ZONE = "Europe/Amsterdam";
const CLASS_NAME = process.env.VG_CLASS_NAME || "Power en Conditioning";
const TARGET_TIME = "20:01";

// 1) Alleen draaien op maandag 20:01 Amsterdam
const now = DateTime.now().setZone(ZONE);
const hhmm = now.toFormat("HH:mm");

if (!(now.weekday === 1 && hhmm === TARGET_TIME)) { // 1 = Monday
  console.log(`Skip: now=${now.toISO()} (${ZONE}), not Monday ${TARGET_TIME}`);
  process.exit(0);
}

// 2) Target date = volgende week maandag (dus +7 dagen)
const target = now.plus({ days: 7 }).startOf("day");
const targetISO = target.toISODate(); // bv "2026-02-23"
console.log("Booking target date:", targetISO, "class:", CLASS_NAME);