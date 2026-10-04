// Asks Gemini whether an image shows a creatine supplement container.

const MODEL = 'gemini-3.8-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT = 'Does this image show a container or tub of creatine supplement? Reply only YES or NO.';

async function isCreatineContainer(buffer, mimeType) {
  const res = await fetch(`${ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
            { text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const answer = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  return /^YES/i.test(answer);
}

module.exports = { isCreatineContainer };
