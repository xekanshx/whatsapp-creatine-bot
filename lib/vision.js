// Asks Claude whether an image shows a creatine supplement container.

const MODEL = 'claude-haiku-4-5';

const PROMPT =
  'Does this image show a creatine supplement container (a tub, jar, pouch or bottle of creatine)? ' +
  'Answer with exactly one word: YES or NO.';

async function isCreatineContainer(buffer, mimeType) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 5,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic request failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const answer = (data.content?.find((b) => b.type === 'text')?.text || '').trim().toUpperCase();
  return /^YES\b/.test(answer);
}

module.exports = { isCreatineContainer };
