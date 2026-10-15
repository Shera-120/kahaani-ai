// Kahaani AI — Bulbul v4-flash TTS proxy (Netlify Function).
//
// Holds the Sarvam API key server-side and proxies text-to-speech so the key
// never reaches the browser. Serves at POST /api/tts.
//
// The key is read from the SARVAM_API_KEY environment variable (scope must
// include "Functions"). Set it in the Netlify UI, then redeploy.
//
// Uses Node's built-in http/https rather than fetch, so there is no bundler
// or undici dependency.

import http from 'node:http';
import https from 'node:https';

const MODEL = 'bulbul:v4-flash';
const MAX_CHARS = 2500; // Sarvam REST limit

function env(name) {
  // Netlify's runtime provides the Netlify global; fall back for local runs.
  if (globalThis.Netlify && Netlify.env && typeof Netlify.env.get === 'function') {
    return Netlify.env.get(name);
  }
  return process.env[name];
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function postJson(url, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(bodyObj));
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': data.length },
        timeout: 45_000,
      },
      (up) => {
        const chunks = [];
        up.on('data', (c) => chunks.push(c));
        up.on('end', () => resolve({ status: up.statusCode || 0, body: Buffer.concat(chunks) }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('upstream-timeout')));
    req.on('error', reject);
    req.end(data);
  });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);

  const key = env('SARVAM_API_KEY');
  if (!key) {
    return json(
      {
        error: 'no-key',
        message:
          'SARVAM_API_KEY is not set. Add it in Netlify → Project configuration → Environment variables (scope: Functions), then redeploy.',
      },
      503
    );
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad-json' }, 400);
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) return json({ error: 'empty-text' }, 400);
  if (text.length > MAX_CHARS) return json({ error: 'too-long', max: MAX_CHARS }, 413);

  const body = {
    text,
    model: env('SARVAM_MODEL') || MODEL,
    language_code: typeof payload.language_code === 'string' ? payload.language_code : 'hi-IN',
    speech_sample_rate: 22050,
    enable_preprocessing: true,
  };
  if (payload.speaker) body.speaker = String(payload.speaker);
  const pace = Number(payload.pace);
  if (Number.isFinite(pace)) body.pace = Math.min(2, Math.max(0.5, pace));

  const endpoint = env('SARVAM_TTS_URL') || 'https://api.sarvam.ai/text-to-speech';

  let up;
  try {
    up = await postJson(
      endpoint,
      { 'Content-Type': 'application/json', 'api-subscription-key': key },
      body
    );
  } catch (err) {
    return json({ error: 'upstream-unreachable', message: String(err && err.message) }, 502);
  }

  if (up.status < 200 || up.status >= 300) {
    // Surface Sarvam's own status/message — never the key.
    return json(
      { error: 'sarvam-error', status: up.status, detail: up.body.toString('utf8').slice(0, 600) },
      up.status
    );
  }

  let data;
  try {
    data = JSON.parse(up.body.toString('utf8'));
  } catch {
    return json({ error: 'bad-upstream-json' }, 502);
  }

  const b64 = data && Array.isArray(data.audios) ? data.audios[0] : null;
  if (!b64) return json({ error: 'no-audio', detail: JSON.stringify(data).slice(0, 400) }, 502);

  return new Response(Buffer.from(b64, 'base64'), {
    status: 200,
    headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' },
  });
};

export const config = {
  path: '/api/tts',
  rateLimit: {
    action: 'rate_limit',
    aggregateBy: 'ip',
    windowSize: 60,
    windowLimit: 40,
  },
};
