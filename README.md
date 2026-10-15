# Kahaani AI — Stories That Speak

Hindi-first bedtime storytelling app. Pick a folk tale (or write your own) and
hear it told in a warm Indian storyteller's voice, with each sentence lighting
up as it is read.

- Frontend: a single self-contained page, `public/index.html` (no build step).
- Narration: Sarvam **Bulbul v4-flash**, proxied through a Netlify Function
  (`netlify/functions/tts.mjs`) so the API key stays server-side.

## Deploy

1. In Netlify: **Add new site → Import from Git**, pick this repository.
   Build settings come from `netlify.toml` — no build command, publish `public`.
2. After the first deploy, go to **Project configuration → Environment variables**
   and add `SARVAM_API_KEY` with your Sarvam key, scope **Functions**.
3. Redeploy — environment-variable changes only apply on a new deploy.

Then open the site URL and press play. Narration is already set to
**Bulbul v4-flash (live)**.

## Why a function

Sarvam's documentation is explicit: never call their API from browser code, and
never embed the key client-side. The function holds the key, validates every
request, and proxies `/api/tts`. The browser never sees the key.

## Endpoint

```
POST /api/tts
  { "text": "…", "language_code": "hi-IN", "speaker": "ishita_hi_devotional", "pace": 1 }
→ 200 audio/wav
```

Guards: text required, ≤ 2,500 characters; pace clamped to 0.5–2.0; per-IP rate
limit of 40 requests/minute.

## Settings in the app

Gear icon → **Language** (interface language, story & voice language — 11
languages listed), **Voice** (storyteller persona, pace), **Appearance**
(night / day), **Narration** (engine, backend URL).
