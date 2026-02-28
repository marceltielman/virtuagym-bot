# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Playwright-based bot that automatically books a Virtuagym gym class every Monday at 20:00 Amsterdam time. Runs headless on an EC2 instance via cron.

## Commands

```bash
npm run book        # Run EC2 booking script (headless)
npm run book:test   # Run in test mode (skips time-window check)
node save-session.js  # Interactive login to create storageState.json
```

## Architecture

Two booking script variants share the same logic but differ in execution context:

- **`book-virtuagym.js`** — Local/GUI variant. Can enable `slowMo` for debugging. Takes screenshots. Has `shouldRunNowAmsterdam()` for point-in-time checks.
- **`book-virtuagym-ec2.js`** — EC2 variant. Headless only, timestamped `log()`/`logError()`, no screenshots. Sleeps until exactly 20:00 AMS.

Both scripts follow the same flow: check time window → sleep until target time → compute next Monday's week URL → find class tile by CSS selector → check if full → click book button.

**`save-session.js`** opens a headed browser for manual login (including reCAPTCHA), then saves cookies/localStorage to `storageState.json`. Both booking scripts load this file to skip login.

**`setup-ec2.sh`** provisions a fresh Ubuntu 24.04 EC2: installs Node.js 20, clones repo, runs `npm ci`, installs Playwright Chromium, prompts for `.env` values, and installs crontab.

## Key Conventions

- ESM modules (`"type": "module"`)
- All times use `Europe/Amsterdam` timezone via Luxon (`ZONE` constant)
- Booking window: Monday 20:00–20:03 AMS. Cron starts at 18:55 UTC (wintertijd)
- Session auth via `storageState.json` (git-ignored) — no password in env
- Week URL anchored on Saturday (target Monday + 5 days)
- DOM tile selector: `internal-event-day-DD-MM-YYYY` class format

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VG_LOGIN_URL` | Yes | Base URL for the Virtuagym club page |
| `VG_WEEK_QUERY` | No | Extra query string appended to the week URL |
| `VG_CLASS_NAME` | Yes | Exact class name as shown in the schedule |
| `VG_CLASS_TIME` | Yes | Exact time string as shown in the schedule |
| `VG_TEST_MODE` | No | Set to `1` to skip the time-window check |
