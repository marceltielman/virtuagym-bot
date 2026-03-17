# Virtuagym Auto-Booker

Playwright bot that automatically books a Virtuagym gym class every Monday at 20:00 Amsterdam time. Designed to run headless on an EC2 instance via cron.

## Prerequisites

- **Node.js 20+**
- A Virtuagym club account with an active membership

## Quick Start (Local)

### 1. Clone the repo

```bash
git clone https://github.com/marceltielman/virtuagym-bot.git
cd virtuagym-bot
```

### 2. Install dependencies

```bash
npm ci
npx playwright install --with-deps chromium
```

### 3. Create a `.env` file

```bash
cp .env.example .env   # or create manually
```

Fill in the required values:

| Variable | Required | Description | Example |
|---|---|---|---|
| `VG_LOGIN_URL` | Yes | Base URL for your Virtuagym club page | `https://bonjaskyacademyhilversum.virtuagym.com` |
| `VG_EMAIL` | Yes | Your Virtuagym login email | |
| `VG_PASSWORD` | Yes | Your Virtuagym login password | |
| `VG_WEEK_QUERY` | No | Query string appended to the week URL (filters for class type, etc.) | `?event_type=2&coach=0&activity_id=0&...` |
| `VG_CLASS_NAME` | Yes | Exact class name as shown in the schedule | `Power and Conditioning` |
| `VG_CLASS_TIME` | Yes | Exact time string as shown in the schedule | `20:00 - 20:55` |
| `VG_TEST_MODE` | No | Set to `1` to skip the time-window check (useful for testing) | `0` |

### 4. Save your login session

The bot uses saved browser cookies to skip the login page (which has reCAPTCHA). You need to log in once manually:

```bash
node save-session.js
```

This opens a browser window. Log in with your credentials, complete any reCAPTCHA, and wait until the schedule/agenda page loads. The script automatically saves your session to `storageState.json` and closes the browser.

> **Note:** `storageState.json` is git-ignored. You need to repeat this step if your session expires.

### 5. Test the booking

```bash
npm run book:test
```

This runs the booking script with `VG_TEST_MODE=1`, which skips the Monday 20:00 time-window check so you can verify everything works at any time.

### 6. Run for real

```bash
npm run book
```

This only executes within the Monday 19:50–20:03 Amsterdam time window. It waits/sleeps until exactly 20:00 before clicking the book button.

## EC2 Deployment

### 1. Create an EC2 instance

1. Go to the [AWS EC2 Console](https://console.aws.amazon.com/ec2/)
2. Click **Launch Instance**
3. Configure the instance:
   - **Name:** `virtuagym-bot`
   - **AMI:** Ubuntu 24.04 LTS (search "Ubuntu" in the AMI picker)
   - **Architecture:** 64-bit (x86)
   - **Instance type:** `t2.micro` (free tier eligible) or `t3.micro`
   - **Key pair:** Create a new key pair or select an existing one (you'll need this to SSH in). Download the `.pem` file and keep it safe
   - **Network settings:** Allow SSH traffic (port 22) from your IP
   - **Storage:** 8 GB gp3 (default is fine)
4. Click **Launch Instance**
5. Wait for the instance state to show **Running**
6. Copy the **Public IPv4 address** from the instance details

> **Free tier:** `t2.micro` is included in the AWS Free Tier (750 hours/month for the first 12 months). This bot only runs briefly once a week, so it fits well within free tier limits.

### 2. Connect to EC2

```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@<ec2-public-ip>
```

### 3. Run the setup script

```bash
curl -fsSL https://raw.githubusercontent.com/marceltielman/virtuagym-bot/main/setup-ec2.sh | bash
```

Or clone first and run locally:

```bash
git clone https://github.com/marceltielman/virtuagym-bot.git ~/virtuagym
cd ~/virtuagym
bash setup-ec2.sh
```

The script will:
1. Update the system and install Node.js 20
2. Clone the repo (or pull latest)
3. Run `npm ci` and install Playwright Chromium with OS dependencies
4. Prompt you for `.env` values interactively
5. Install cron jobs for every Monday

### 4. Upload your session file

From your local machine, copy the saved session to EC2:

```bash
scp storageState.json ubuntu@<ec2-ip>:~/virtuagym/
```

### 5. Verify

```bash
cd ~/virtuagym
npm run book:test
```

### 6. Check cron

The setup script installs two cron entries (wintertijd / CET timing):

```
55-59 18 * * 1  →  runs at 18:55–18:59 UTC (19:55–19:59 CET)
0-5   19 * * 1  →  runs at 19:00–19:05 UTC (20:00–20:05 CET)
```

The script itself sleeps until exactly 20:00 Amsterdam time before booking.

Check cron is installed:

```bash
crontab -l
```

Check logs after a Monday run:

```bash
cat ~/virtuagym/cron.log
```

## How It Works

1. **Time check** — verifies it's Monday 19:50–20:03 Amsterdam time (skipped in test mode)
2. **Sleep** — waits until exactly 20:00 before proceeding
3. **Navigate** — opens the schedule page for next Monday's week (URL anchored on Saturday)
4. **Find class** — locates the tile matching your class name and time via CSS selectors
5. **Check availability** — skips if the class is full or already booked
6. **Book** — clicks the booking button
7. **Retry** — if booking fails (e.g. server error from high traffic at 20:00), retries every 15 seconds up to 4 attempts (~1 minute total)
8. **Save session** — stores refreshed cookies for the next run

## Troubleshooting

| Problem | Solution |
|---|---|
| "Not logged in" error | Re-run `node save-session.js` locally and re-upload `storageState.json` |
| "Class tile not found" | Check that `VG_CLASS_NAME` and `VG_CLASS_TIME` exactly match what's shown on the schedule |
| Script exits with "outside window" | Normal behavior outside Monday 19:50–20:03 AMS. Use `npm run book:test` to test anytime |
| Cron not firing | Verify with `crontab -l`. Check that cron times match your timezone (wintertijd vs zomertijd) |

## Scripts

| Command | Description |
|---|---|
| `npm run book` | Run the EC2 booking script (headless, respects time window) |
| `npm run book:test` | Run in test mode (skips time-window check) |
| `node save-session.js` | Interactive login to save `storageState.json` |
| `bash setup-ec2.sh` | Provision a fresh Ubuntu EC2 instance |
