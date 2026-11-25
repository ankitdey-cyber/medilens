# MediLens — Local Setup & Run Guide

MediLens is a React + Vite + Express medicine label scanner, multilingual informational reference, nearby pharmacy finder, and pharmacist chat app powered by the Gemini API (`@google/genai`).

---

## 1. Prerequisites

- **Node.js** v20+ (with `npm`)
- A **Gemini API key** from Google AI Studio

---

## 2. Get a Gemini API Key

1. Open **[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)** and sign in with your Google account.
2. Click **Create API key**.
3. Copy the generated key.
   - **Note on key formats:** Newer Gemini API keys start with `AQ.` (while older keys start with `AIza`). Both formats are completely normal and supported automatically—no prefix changes needed.

---

## 3. Configure `.env`

1. Copy `.env.example` to `.env` (or `.env.local` if you want a local override; `.env.local` is loaded first, then `.env`):
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and set your key:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key
   ```
   Optional model overrides (defaults are auto-checked against your key on startup):
   ```env
   GEMINI_MODEL=gemini-4-hydrogen
   GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
   ```
3. Never commit `.env` or `.env.local` (both are already ignored in `.gitignore`).

---

## 4. Install & Run

### Development mode
```bash
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

To verify your API key and available models, open:
**[http://localhost:3000/api/health?diag=1](http://localhost:3000/api/health?diag=1)**
It should return `"configured": true`, `"listError": null`, and `"primaryModelListed": true` / `"fallbackModelListed": true`.

### Production mode
```bash
npm run build
npm start
```
`npm start` runs `cross-env NODE_ENV=production tsx server.ts` and serves the compiled `dist/` bundle alongside the `/api/*` endpoints.

### Camera, Microphone & Location Notes
- Browsers only allow camera, microphone, and GPS access on **`http://localhost`** or **`https://`**.
- If you open the app over plain HTTP on a LAN IP, MediLens shows an on-screen notice and lets you **Upload Photo Instead** (or use the built-in test samples).
- If location permission is denied, Nearby Pharmacies falls back gracefully to default Kolkata coordinates (`22.5726, 88.3639`).

---

## 5. Troubleshooting

| HTTP Code | Cause | How to Fix |
| --- | --- | --- |
| **401 (`UNAUTHENTICATED` / `API_KEY_INVALID`)** | The key in `.env` is invalid, revoked, truncated, or still a placeholder. | Generate a fresh key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), paste it into `.env` as `GEMINI_API_KEY=...`, and restart the server. |
| **403 (`PERMISSION_DENIED`)** | Either the key has HTTP referrer / IP restrictions (blocking Node.js server requests), the Generative Language API is not enabled on its project, or the key does not have access to a specific model. | Use an unrestricted server key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (remove HTTP referrer restrictions), or set `GEMINI_MODEL` in `.env` to a model listed in `/api/health?diag=1`. |
| **404 (`NOT_FOUND`)** | The configured `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` does not exist or is retired for your key. | Check `sampleListedModels` at `/api/health?diag=1` and set `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` in `.env` to valid model IDs. (MediLens also auto-selects available Flash / Flash-Lite models on startup.) |
| **429 (`RESOURCE_EXHAUSTED`)** | Free-tier rate limit or daily/per-minute quota was reached (or Google Search / Maps grounding quota is exhausted on free tier). | Wait ~60 seconds and tap **Retry Scan**, or enable billing on your Gemini API project. MediLens automatically falls back to `GEMINI_FALLBACK_MODEL` and ungrounded responses when grounding hits quota. |
