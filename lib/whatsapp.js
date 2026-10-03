// Thin wrappers over Meta's WhatsApp Cloud API (Graph API) using plain fetch.

const GRAPH_URL = 'https://graph.facebook.com/v22.0';

function authHeaders() {
  return { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
}

async function sendText(to, text) {
  const res = await fetch(`${GRAPH_URL}/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp send failed (${res.status}): ${await res.text()}`);
  }
}

// Two steps: media_id -> short-lived URL, then download the bytes (URL needs the token too).
async function downloadMedia(mediaId) {
  const metaRes = await fetch(`${GRAPH_URL}/${mediaId}`, { headers: authHeaders() });
  if (!metaRes.ok) {
    throw new Error(`Media lookup failed (${metaRes.status}): ${await metaRes.text()}`);
  }
  const { url, mime_type: mimeType } = await metaRes.json();

  const fileRes = await fetch(url, { headers: authHeaders() });
  if (!fileRes.ok) {
    throw new Error(`Media download failed (${fileRes.status})`);
  }
  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: mimeType || fileRes.headers.get('content-type') || 'image/jpeg' };
}

module.exports = { sendText, downloadMedia };
