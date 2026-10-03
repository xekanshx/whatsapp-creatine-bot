// Minimal Upstash Redis REST client: one JSON state object under one key.

const STATE_KEY = 'creatine:state';

const DEFAULT_STATE = {
  streak: 0,
  lastConfirmedDate: null, // YYYY-MM-DD of the last accepted photo
  lastAskedDate: null, // YYYY-MM-DD of the last check-in sent
};

// Upstash accepts a Redis command as a JSON array POSTed to the base URL.
async function command(args) {
  const res = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`Upstash ${args[0]} failed (${res.status}): ${body.error || 'unknown error'}`);
  }
  return body.result;
}

async function getState() {
  const raw = await command(['GET', STATE_KEY]);
  if (!raw) return { ...DEFAULT_STATE };
  return { ...DEFAULT_STATE, ...JSON.parse(raw) };
}

async function setState(state) {
  await command(['SET', STATE_KEY, JSON.stringify(state)]);
}

module.exports = { getState, setState };
