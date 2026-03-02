# EC2 Setup Manual — Virtuagym Booking Bot

## EC2 Instance Specs

- **AMI:** Ubuntu 24.04 LTS (amd64)
- **Instance type:** t3.micro
- **Storage:** 16 GiB
- **Security group:** Allow SSH (port 22) from anywhere
- **Architecture:** x86_64 (not ARM — Playwright compatibility)

## Initial Setup

### 1. Store your SSH key locally

```bash
mv ~/Downloads/your-key.pem ~/.ssh/
chmod 400 ~/.ssh/your-key.pem
```

### 2. SSH into the instance

```bash
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

> If you get `Error opening terminal: xterm-ghostty`, run `export TERM=xterm-256color` first.

### 3. Generate a deploy key on EC2

```bash
ssh-keygen -t ed25519 -C "ec2-virtuagym" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy the output and add it on GitHub: **Repo → Settings → Deploy keys → Add deploy key**.

### 4. Clone the repo

```bash
git clone git@github.com:marceltielman/virtuagym-bot.git ~/virtuagym
```

### 5. Run the setup script

```bash
cd ~/virtuagym
chmod +x setup-ec2.sh
./setup-ec2.sh
```

This installs Node.js 20, npm dependencies, Playwright Chromium, prompts for `.env` values, and installs the crontab.

### 6. Upload storageState.json

On your **local machine**, create a fresh session:

```bash
cd ~/projects/virtuagym
node save-session.js
```

Log in manually in the browser. Once you see the schedule, it saves automatically.

Then upload:

```bash
scp -i ~/.ssh/your-key.pem storageState.json ubuntu@<EC2_PUBLIC_IP>:~/virtuagym/
```

### 7. Install crontab (if not already done)

```bash
crontab -e
```

Add these lines (no leading spaces):

```
# virtuagym-bot
55-59 18 * * 1 cd ~/virtuagym && /usr/bin/node book-virtuagym-ec2.js >> ~/virtuagym/cron.log 2>&1
0-5 19 * * 1 cd ~/virtuagym && /usr/bin/node book-virtuagym-ec2.js >> ~/virtuagym/cron.log 2>&1
```

Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

Verify: `crontab -l`

### 8. Test

```bash
cd ~/virtuagym && npm run book:test
```

Expected: it will find the class tile but fail on `#book_btn` timeout — that's normal outside the booking window.

## Cron Schedule

The cron uses **UTC** times (EC2 default):

| Amsterdam (CET/wintertijd) | UTC | Cron |
|---|---|---|
| 19:55–19:59 | 18:55–18:59 | `55-59 18 * * 1` |
| 20:00–20:05 | 19:00–19:05 | `0-5 19 * * 1` |

The script itself sleeps until exactly 20:00 Amsterdam time, then books.

> **Zomertijd (CEST):** Adjust cron one hour earlier (17:55–18:05 UTC).

## Monitoring

```bash
# Check logs after Monday 20:00
cat ~/virtuagym/cron.log

# Watch live
tail -f ~/virtuagym/cron.log
```

The log file is created automatically on first cron run.

## Maintenance

### Session expired

If logs show `#agenda` timeout, the session has expired. Re-run locally:

```bash
node save-session.js
scp -i ~/.ssh/your-key.pem storageState.json ubuntu@<EC2_PUBLIC_IP>:~/virtuagym/
```

### Update code

SSH into EC2:

```bash
cd ~/virtuagym && git pull && npm ci
```

### Switch winter/zomertijd

Edit crontab (`crontab -e`) and adjust UTC hours:
- **Wintertijd (CET):** 18:55 / 19:00 UTC
- **Zomertijd (CEST):** 17:55 / 18:00 UTC
