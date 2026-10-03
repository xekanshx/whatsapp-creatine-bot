# Creatine Bot

A WhatsApp bot that nags you every hour (12:00–23:59) until you prove you took your creatine by sending a **photo of the tub**. Claude Haiku 4.5 checks the photo, and the bot tracks your streak in Upstash Redis.

Only dependency: `express`. Everything else (WhatsApp, Upstash, Anthropic) is plain `fetch`.

## How it works

| Step | What happens |
| --- | --- |
| Hourly | cron-job.org calls `GET /send-checkin?secret=…`. If you haven't confirmed today, the bot texts you with your streak. If you have, it sends nothing. |
| You reply with a photo | The bot downloads it from Meta, sends it to `claude-haiku-4-5`, and expects `YES` or `NO`. |
| `YES` | Today is confirmed, streak +1 (once per day), nagging stops until tomorrow. |
| `NO` | Bot asks for a real photo; hourly nagging continues. |
| You reply with text | Bot reminds you a photo is required. |
| Missed a day | At the next check-in the streak resets to 0. |

Notes on behavior:

- **"Today"** is the calendar date in `TIMEZONE` (default `UTC`, so set it!). Check-ins only fire between 12:00 and 23:59 local time, even if cron calls more often, so you can safely schedule cron hourly all day.
- A photo sent after a missed day starts the streak over at 1.
- Messages from any number other than `MY_WHATSAPP_NUMBER` are ignored.

## Endpoints

- `GET /send-checkin?secret=CRON_SECRET` – cron trigger.
- `GET /webhook` – Meta's verification handshake.
- `POST /webhook` – incoming WhatsApp messages.
- `GET /` – health check.

## 1. Create the Meta app and get credentials

1. Go to <https://developers.facebook.com/apps> → **Create App** → use case **Other** → app type **Business**.
2. On the app dashboard, **Add product → WhatsApp → Set up**. Meta creates a test WhatsApp Business account and a test phone number for you.
3. Open **WhatsApp → API Setup**:
   - Copy the **Phone number ID** → `PHONE_NUMBER_ID`.
   - Under **To**, add **your personal number** as a recipient and verify it with the code Meta sends. (With the test number you can only message verified recipients.)
   - Set `MY_WHATSAPP_NUMBER` to that number, digits only with country code, no `+` (e.g. `919876543210`).
4. Create a **permanent** access token (the one on the API Setup page expires in 24 hours):
   1. <https://business.facebook.com/settings> → **Users → System users → Add** (role: Admin).
   2. **Add assets** → Apps → select your app → grant **Full control**.
   3. **Generate new token** → pick your app → tick `whatsapp_business_messaging` and `whatsapp_business_management` → set expiry to **Never** → copy it → `WHATSAPP_TOKEN`.
5. Make up a random string for `VERIFY_TOKEN` (you'll paste it into Meta later) and another for `CRON_SECRET`, e.g. `openssl rand -hex 24`.

> **The 24-hour window.** WhatsApp only allows free-form text messages within 24 hours of your last message *to* the bot. Because you reply every day, the window normally stays open. If you skip more than a day, the bot's messages will fail until you send it any message (e.g. "hi") to reopen the window. Use the test number's chat in WhatsApp: message it first to start the conversation.

## 2. Set up Upstash Redis

1. Sign up at <https://console.upstash.com> → **Create Database** (Redis). Pick a region near your Render region. The free tier is plenty.
2. On the database page, scroll to the **REST API** section and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN` (use the regular token, not the read-only one)

The bot stores a single key, `creatine:state`, with `{ streak, lastConfirmedDate, lastAskedDate }`. No setup needed; it's created on first write.

## 3. Get an Anthropic API key

Create one at <https://console.anthropic.com/settings/keys> → `ANTHROPIC_API_KEY`. Each photo check costs a fraction of a cent.

## 4. Run locally (optional)

```bash
npm install
cp .env.example .env    # fill in the values
npm run dev             # needs Node 20.6+ for --env-file
```

To receive Meta's webhook locally you'd need a tunnel (ngrok, cloudflared). Simpler to deploy straight to Render.

## 5. Deploy to Render

1. Push this folder to a GitHub repo (`.env` is git-ignored).
2. On <https://render.com>: **New → Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Under **Environment**, add every variable from [.env.example](.env.example):

   | Variable | Value |
   | --- | --- |
   | `WHATSAPP_TOKEN` | permanent System User token |
   | `PHONE_NUMBER_ID` | from API Setup |
   | `MY_WHATSAPP_NUMBER` | your number, digits only |
   | `VERIFY_TOKEN` | your random string |
   | `UPSTASH_REDIS_REST_URL` | from Upstash |
   | `UPSTASH_REDIS_REST_TOKEN` | from Upstash |
   | `CRON_SECRET` | your random string |
   | `ANTHROPIC_API_KEY` | from Anthropic |
   | `TIMEZONE` | e.g. `Asia/Kolkata` (optional, defaults to UTC) |

   `PORT` is set by Render automatically; don't add it.
5. Deploy. Your URL will look like `https://creatine-bot.onrender.com`. Visiting it should print `creatine-bot ok`.

> Render's free tier sleeps after ~15 minutes idle and takes ~30–60s to wake. The hourly cron keeps it warm during the day. If the very first webhook after a long idle looks slow, Meta retries automatically and the bot de-duplicates.

## 6. Connect Meta's webhook

1. In the Meta app: **WhatsApp → Configuration → Webhook → Edit**.
2. **Callback URL:** `https://<your-service>.onrender.com/webhook`
3. **Verify token:** the exact `VERIFY_TOKEN` you set in Render.
4. Click **Verify and save**. (Meta calls `GET /webhook`; the service must already be running with the env vars set.)
5. Under **Webhook fields**, click **Manage** and **subscribe to `messages`**.

## 7. Schedule the hourly cron on cron-job.org

1. Sign up at <https://cron-job.org> → **Create cronjob**.
2. **URL:** `https://<your-service>.onrender.com/send-checkin?secret=<CRON_SECRET>`
3. **Schedule:** every hour, on the hour. In the custom schedule select all hours (or just 12–23 in *your* timezone; set the cron-job.org account timezone to match). The server also enforces 12:00–23:59 in `TIMEZONE`, so out-of-window calls are harmless and return `{"result":"outside-hours"}`.
4. Save, then use **Test run**. The response should be `{"result":"sent"}` and you should get a WhatsApp message.

Possible `/send-checkin` results: `sent`, `already-confirmed`, `outside-hours`. A wrong secret returns `401`.

## Testing end to end

1. First, send "hi" from your phone to the test number so the 24h window is open.
2. Hit the `/send-checkin` URL in a browser during 12:00–23:59 (in `TIMEZONE`). You get the check-in text.
3. Reply with text → you get the "photo needed" reminder.
4. Reply with a random photo → "doesn't look like a creatine tub".
5. Reply with a photo of a creatine tub → streak confirmation. Hitting `/send-checkin` again returns `already-confirmed`.

## Security notes

- `CRON_SECRET` travels in a query string, so keep the URL private and use HTTPS (Render provides it).
- The webhook doesn't verify Meta's `X-Hub-Signature-256` header; it instead ignores everything not from `MY_WHATSAPP_NUMBER`. That's fine for a personal bot, but a spoofed POST claiming to be from your number could trigger a photo check with a media id it doesn't own (which simply fails at Meta's Media API).
