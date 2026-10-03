const crypto = require('crypto');
const express = require('express');
const { sendText, downloadMedia } = require('./lib/whatsapp');
const { getState, setState } = require('./lib/redis');
const { isCreatineContainer } = require('./lib/vision');
const { assertValidTimezone, nowInTimezone, previousDay } = require('./lib/time');

const REQUIRED_ENV = [
  'WHATSAPP_TOKEN',
  'PHONE_NUMBER_ID',
  'MY_WHATSAPP_NUMBER',
  'VERIFY_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CRON_SECRET',
  'ANTHROPIC_API_KEY',
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}
assertValidTimezone();

const ME = process.env.MY_WHATSAPP_NUMBER.replace(/\D/g, '');
const CHECKIN_FIRST_HOUR = 12; // local hours during which check-ins may fire (12:00-23:59)
const CHECKIN_LAST_HOUR = 23;

const app = express();
app.use(express.json());

// State is a single read-modify-write blob, so run every handler that touches it one at a time.
let queue = Promise.resolve();
function serialize(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

app.get('/', (req, res) => res.send('creatine-bot ok'));

// --- Cron-triggered check-in -------------------------------------------------

app.get('/send-checkin', async (req, res) => {
  if (!req.query.secret || !safeEqual(req.query.secret, process.env.CRON_SECRET)) {
    return res.sendStatus(401);
  }
  try {
    const result = await serialize(async () => {
      const { date: today, hour } = nowInTimezone();
      if (hour < CHECKIN_FIRST_HOUR || hour > CHECKIN_LAST_HOUR) return 'outside-hours';

      const state = await getState();
      if (state.lastConfirmedDate === today) return 'already-confirmed';

      // Streak survives only if the last confirmation was yesterday.
      if (state.lastConfirmedDate !== previousDay(today)) state.streak = 0;

      await sendText(
        ME,
        `Did you take your creatine today? 💪\nCurrent streak: ${days(state.streak)}.\n` +
          'Reply with a photo of your creatine tub to confirm.'
      );
      state.lastAskedDate = today;
      await setState(state);
      return 'sent';
    });
    res.json({ result });
  } catch (err) {
    console.error('send-checkin failed:', err);
    res.status(500).json({ error: 'check-in failed' });
  }
});

// --- Meta webhook ------------------------------------------------------------

app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token && safeEqual(token, process.env.VERIFY_TOKEN)) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Meta redelivers a webhook if it isn't acked quickly or if we error, so remember recent ids.
const seenMessageIds = new Set();
function isDuplicate(id) {
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.add(id);
  if (seenMessageIds.size > 500) seenMessageIds.delete(seenMessageIds.values().next().value);
  return false;
}

app.post('/webhook', (req, res) => {
  // Ack immediately; the vision call can take longer than Meta is willing to wait.
  res.sendStatus(200);

  const messages = (req.body?.entry || [])
    .flatMap((e) => e.changes || [])
    .flatMap((c) => c.value?.messages || []);

  for (const msg of messages) {
    if (String(msg.from).replace(/\D/g, '') !== ME) continue;
    if (isDuplicate(msg.id)) continue;
    serialize(() => handleMessage(msg)).catch((err) => console.error('handleMessage failed:', err));
  }
});

async function handleMessage(msg) {
  if (msg.type !== 'image') {
    await sendText(ME, 'Please reply with a photo of your creatine tub to confirm 📸');
    return;
  }

  const { date: today } = nowInTimezone();
  const state = await getState();

  if (state.lastConfirmedDate === today) {
    await sendText(ME, `Already confirmed today ✅ Streak: ${days(state.streak)}.`);
    return;
  }

  let isCreatine;
  try {
    const { buffer, mimeType } = await downloadMedia(msg.image.id);
    isCreatine = await isCreatineContainer(buffer, mimeType);
  } catch (err) {
    console.error('Photo verification failed:', err);
    await sendText(ME, "Couldn't check that photo just now, please send it again in a bit.");
    return;
  }

  if (!isCreatine) {
    await sendText(ME, "That doesn't look like a creatine tub. Send a real photo of it to confirm 📸");
    return;
  }

  // Extend the streak only if yesterday was confirmed; otherwise it starts over at 1.
  const continuing = state.lastConfirmedDate === previousDay(today);
  state.streak = (continuing ? state.streak : 0) + 1;
  state.lastConfirmedDate = today;
  await setState(state);
  await sendText(ME, `Creatine confirmed ✅ Streak: ${days(state.streak)} 🔥 See you tomorrow!`);
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`creatine-bot listening on ${port}`));
