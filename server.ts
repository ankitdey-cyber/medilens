import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local first (higher precedence), then .env (override: false) and track key source
let apiKeySource: 'process.env' | '.env.local' | '.env' | 'none' = process.env.GEMINI_API_KEY
  ? 'process.env'
  : 'none';

const envLocalPath = path.resolve(__dirname, '.env.local');
const envPath = path.resolve(__dirname, '.env');

dotenv.config({ path: envLocalPath, override: false });
if (apiKeySource === 'none' && process.env.GEMINI_API_KEY) {
  apiKeySource = '.env.local';
}

dotenv.config({ path: envPath, override: false });
if (apiKeySource === 'none' && process.env.GEMINI_API_KEY) {
  apiKeySource = '.env';
}

const PLACEHOLDER_KEYS = new Set(['MY_GEMINI_API_KEY', 'YOUR_KEY_HERE', 'YOUR_API_KEY']);

function normalizeApiKey(raw: string | undefined): string {
  if (!raw) return '';
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

function getApiKey(): string {
  return normalizeApiKey(process.env.GEMINI_API_KEY);
}

function isPlaceholderOrEmptyKey(key: string): boolean {
  return !key || PLACEHOLDER_KEYS.has(key.toUpperCase());
}

function maskApiKey(key: string): string {
  if (!key) return '(empty)';
  if (key.length <= 10) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function redactApiKey(text: string): string {
  const key = getApiKey();
  let safe = text;
  if (key && key.length >= 8) {
    safe = safe.split(key).join('[REDACTED_API_KEY]');
  }
  safe = safe.replace(/([?&]key=)[^&\s"']+/gi, '$1[REDACTED_API_KEY]');
  return safe;
}

let activePrimaryModel = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';
let activeFallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite';
const configuredPrimaryModel = activePrimaryModel;
const configuredFallbackModel = activeFallbackModel;

type ScanStage = 'camera_capture' | 'image_transmission' | 'gemini_analysis';

class HttpError extends Error {
  status: number;
  stage: ScanStage;
  detail?: string;
  constructor(status: number, message: string, stage: ScanStage = 'gemini_analysis', detail?: string) {
    super(message);
    this.status = status;
    this.stage = stage;
    this.detail = detail;
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = getApiKey();
  if (isPlaceholderOrEmptyKey(apiKey)) {
    throw new HttpError(
      500,
      'GEMINI_API_KEY is not set. Add it to .env and restart the server.',
      'gemini_analysis',
      'Missing or placeholder GEMINI_API_KEY'
    );
  }
  return new GoogleGenAI({
    apiKey,
  });
}

function supportsGenerateContent(model: {
  name?: string;
  supportedActions?: string[];
  supportedGenerationMethods?: string[];
}): boolean {
  const actions = model.supportedActions || model.supportedGenerationMethods;
  if (Array.isArray(actions) && actions.length > 0) {
    return actions.some((a) => a.toLowerCase().includes('generatecontent'));
  }
  return true;
}

async function resolveStartupModels(): Promise<void> {
  const apiKey = getApiKey();
  if (isPlaceholderOrEmptyKey(apiKey)) {
    console.warn(
      '========================================================================\n' +
        `[MediLens WARNING] GEMINI_API_KEY is ${apiKey ? 'still a placeholder value' : 'EMPTY'} (source: ${apiKeySource}).\n` +
        'Add a valid key from https://aistudio.google.com/apikey to .env and restart.\n' +
        '========================================================================'
    );
    return;
  }

  console.log(`[MediLens Config] GEMINI_API_KEY loaded from ${apiKeySource}: ${maskApiKey(apiKey)}`);

  try {
    const ai = getGeminiClient();
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    const available: string[] = [];
    for await (const m of pager) {
      if (!m.name) continue;
      if (!supportsGenerateContent(m as { name?: string; supportedActions?: string[]; supportedGenerationMethods?: string[] })) {
        continue;
      }
      available.push(m.name.replace(/^models\//, ''));
      if (available.length >= 200) break;
    }

    if (available.length === 0) {
      console.warn(
        `[MediLens Models] ai.models.list() returned 0 generateContent models; keeping configured models (${activePrimaryModel}, ${activeFallbackModel}).`
      );
      return;
    }

    const pickFlash = (exclude?: string): string | undefined =>
      available.find(
        (m) =>
          m !== exclude &&
          m.includes('gemini') &&
          m.includes('flash') &&
          !m.includes('lite') &&
          !m.includes('image') &&
          !m.includes('audio') &&
          !m.includes('tts') &&
          !m.includes('thinking')
      ) ||
      available.find(
        (m) =>
          m !== exclude &&
          m.includes('gemini') &&
          m.includes('flash') &&
          !m.includes('image') &&
          !m.includes('audio') &&
          !m.includes('tts')
      ) ||
      available.find((m) => m !== exclude && m.includes('gemini'));

    const pickFlashLite = (exclude?: string): string | undefined =>
      available.find(
        (m) =>
          m !== exclude &&
          m.includes('gemini') &&
          m.includes('flash-lite') &&
          !m.includes('audio') &&
          !m.includes('tts')
      ) ||
      available.find(
        (m) =>
          m !== exclude &&
          m.includes('gemini') &&
          m.includes('flash') &&
          !m.includes('image') &&
          !m.includes('audio') &&
          !m.includes('tts')
      ) ||
      available.find((m) => m !== exclude && m.includes('gemini'));

    if (!available.includes(activePrimaryModel)) {
      const autoPrimary = pickFlash();
      if (autoPrimary) {
        console.warn(
          `[MediLens Models] Configured primary model "${activePrimaryModel}" is not available for this key; auto-selected "${autoPrimary}".`
        );
        activePrimaryModel = autoPrimary;
      }
    }

    if (!available.includes(activeFallbackModel) || activeFallbackModel === activePrimaryModel) {
      const autoFallback = pickFlashLite(activePrimaryModel) || pickFlashLite();
      if (autoFallback) {
        console.warn(
          `[MediLens Models] Configured fallback model "${activeFallbackModel}" is not available for this key; auto-selected "${autoFallback}".`
        );
        activeFallbackModel = autoFallback;
      }
    }

    console.log(
      `[MediLens Models] Active models (${available.length} listed): primary="${activePrimaryModel}", fallback="${activeFallbackModel}"`
    );
  } catch (err) {
    console.warn(
      `[MediLens Models] Startup model check failed (${summarizeUpstreamError(err)}); keeping primary="${activePrimaryModel}", fallback="${activeFallbackModel}".`
    );
  }
}

interface GeminiErrorRecord {
  ts: string;
  model: string;
  attempt: number;
  statusCode?: number;
  summary: string;
}

const recentGeminiErrors: GeminiErrorRecord[] = [];

function recordGeminiError(entry: GeminiErrorRecord) {
  recentGeminiErrors.unshift(entry);
  if (recentGeminiErrors.length > 20) {
    recentGeminiErrors.length = 20;
  }
}

function getErrorStatusCode(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

function isQuotaError(err: unknown): boolean {
  const status = getErrorStatusCode(err);
  const msg = err instanceof Error ? err.message : String(err);
  return status === 429 || msg.includes('RESOURCE_EXHAUSTED') || /\b429\b/.test(msg);
}

function isApiNotEnabledOrRestrictedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('API_KEY_HTTP_REFERRER_BLOCKED') ||
    msg.includes('API_KEY_IP_ADDRESS_BLOCKED') ||
    msg.includes('API_KEY_SERVICE_BLOCKED') ||
    msg.includes('SERVICE_DISABLED') ||
    /has not been used in project/i.test(msg) ||
    /requests from referer/i.test(msg) ||
    /referrer/i.test(msg) ||
    /api.*not enabled/i.test(msg)
  );
}

function isInvalidApiKeyError(err: unknown): boolean {
  const status = getErrorStatusCode(err);
  const msg = err instanceof Error ? err.message : String(err);
  return (
    status === 401 ||
    msg.includes('API_KEY_INVALID') ||
    msg.includes('UNAUTHENTICATED') ||
    /api key not valid/i.test(msg) ||
    /invalid authentication credentials/i.test(msg)
  );
}

function isModelAccessOrNotFoundError(err: unknown): boolean {
  const status = getErrorStatusCode(err);
  const msg = err instanceof Error ? err.message : String(err);
  if (isInvalidApiKeyError(err) || isApiNotEnabledOrRestrictedError(err)) {
    return false;
  }
  return (
    status === 404 ||
    status === 403 ||
    msg.includes('NOT_FOUND') ||
    /\b404\b/.test(msg) ||
    msg.includes('PERMISSION_DENIED') ||
    /\b403\b/.test(msg)
  );
}

function isTransient503Error(err: unknown): boolean {
  const status = getErrorStatusCode(err);
  const msg = err instanceof Error ? err.message : String(err);
  return (
    status === 503 ||
    msg.includes('UNAVAILABLE') ||
    /\b503\b/.test(msg) ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  );
}

function isQuotaOrTransientError(err: unknown): boolean {
  return isQuotaError(err) || isTransient503Error(err);
}

function summarizeUpstreamError(err: unknown, maxLen = 600): string {
  const raw = err instanceof Error ? err.message : String(err);
  return redactApiKey(raw.replace(/\s+/g, ' ')).slice(0, maxLen);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithFallback(
  ai: GoogleGenAI,
  params: Omit<GenerateContentParameters, 'model'>
): Promise<{ response: GenerateContentResponse; modelUsed: string }> {
  const models =
    activePrimaryModel === activeFallbackModel
      ? [activePrimaryModel]
      : [activePrimaryModel, activeFallbackModel];
  const attemptSummaries: string[] = [];
  const failedModels: string[] = [];
  let lastError: unknown;

  for (const model of models) {
    // Retry transient 503/network errors up to 3 attempts with exponential backoff + jitter.
    // On 429 quota exhaustion, 404 NOT_FOUND, or model-level 403 PERMISSION_DENIED,
    // move straight to the fallback model without retrying the same model.
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await ai.models.generateContent({
          ...params,
          model,
        });
        return { response, modelUsed: model };
      } catch (err) {
        lastError = err;
        const summary = summarizeUpstreamError(err);
        const statusCode = getErrorStatusCode(err);
        attemptSummaries.push(`${model}#${attempt + 1}: ${summary}`);
        if (!failedModels.includes(model)) {
          failedModels.push(model);
        }
        recordGeminiError({
          ts: new Date().toISOString(),
          model,
          attempt: attempt + 1,
          statusCode,
          summary,
        });
        console.warn(`[MediLens Gemini] ${model} attempt ${attempt + 1} failed: ${summary}`);

        if (isQuotaError(err) || isModelAccessOrNotFoundError(err)) {
          // Move straight to fallback model on 429, 404 NOT_FOUND, or model-level 403 PERMISSION_DENIED
          break;
        }
        if (!isTransient503Error(err)) {
          if (err && typeof err === 'object') {
            (err as { attemptSummary?: string; failedModels?: string[] }).attemptSummary =
              attemptSummaries.join(' | ');
            (err as { attemptSummary?: string; failedModels?: string[] }).failedModels =
              failedModels;
          }
          throw err;
        }
        if (attempt < maxAttempts - 1) {
          const baseDelayMs = 1000 * Math.pow(2, attempt); // 1000ms, 2000ms
          const jitterMs = Math.floor(Math.random() * 350);
          await sleep(baseDelayMs + jitterMs);
        }
      }
    }
  }

  if (lastError && typeof lastError === 'object') {
    (lastError as { attemptSummary?: string; failedModels?: string[] }).attemptSummary =
      attemptSummaries.join(' | ');
    (lastError as { attemptSummary?: string; failedModels?: string[] }).failedModels =
      failedModels;
  }
  throw lastError;
}

function mapGeminiError(err: unknown): {
  status: number;
  message: string;
  stage: ScanStage;
  detail?: string;
} {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      message: err.message,
      stage: err.stage,
      detail: err.detail ? redactApiKey(err.detail) : undefined,
    };
  }
  const errObj = err as {
    type?: string;
    status?: number;
    message?: string;
    attemptSummary?: string;
    failedModels?: string[];
  } | null;
  if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
    return {
      status: 413,
      message: 'Uploaded image is too large. Please choose a smaller photo.',
      stage: 'image_transmission',
    };
  }
  if (errObj?.type === 'entity.parse.failed') {
    return {
      status: 400,
      message: 'Malformed JSON request body.',
      stage: 'image_transmission',
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const fullDetail = redactApiKey(
    errObj?.attemptSummary ? errObj.attemptSummary : rawMsg.replace(/\s+/g, ' ')
  ).slice(0, 1200);
  const combinedText = `${fullDetail} ${rawMsg}`;
  const sawQuota = combinedText.includes('RESOURCE_EXHAUSTED') || /\b429\b/.test(combinedText);
  const saw503 = rawMsg.includes('UNAVAILABLE') || /\b503\b/.test(rawMsg);
  const failedModelLabel =
    errObj?.failedModels && errObj.failedModels.length > 0
      ? errObj.failedModels.join(' / ')
      : `${activePrimaryModel} / ${activeFallbackModel}`;

  if (isApiNotEnabledOrRestrictedError(err)) {
    return {
      status: 403,
      message:
        'Your Gemini API key is blocked by API/referrer/IP restrictions or the Generative Language API is not enabled on its Google Cloud project. Remove HTTP referrer restrictions (this server calls Gemini from Node.js) or create a new unrestricted key at aistudio.google.com/apikey, put it in .env, and restart.',
      stage: 'gemini_analysis',
      detail: fullDetail,
    };
  }
  if (isInvalidApiKeyError(err)) {
    return {
      status: 401,
      message:
        'Your Gemini API key was rejected. Create a new key at aistudio.google.com/apikey, put it in .env, and restart.',
      stage: 'gemini_analysis',
      detail: fullDetail,
    };
  }
  if (isModelAccessOrNotFoundError(err)) {
    return {
      status: getErrorStatusCode(err) === 403 ? 403 : 404,
      message: `This key cannot use model ${failedModelLabel}. Set GEMINI_MODEL in .env.`,
      stage: 'gemini_analysis',
      detail: fullDetail,
    };
  }
  if (sawQuota) {
    return {
      status: 429,
      message: 'Free-tier limit reached, wait a minute and retry.',
      stage: 'gemini_analysis',
      detail: fullDetail,
    };
  }
  if (saw503) {
    return {
      status: 503,
      message:
        'Gemini AI servers are temporarily overloaded (503) even after automatic retries. Wait a few seconds and tap Retry Scan.',
      stage: 'gemini_analysis',
      detail: fullDetail,
    };
  }
  if (rawMsg.includes('INVALID_ARGUMENT')) {
    return {
      status: 400,
      message:
        'Gemini rejected the request or could not decode the transmitted image. Please retake or upload a standard JPEG or PNG photo.',
      stage: 'image_transmission',
      detail: fullDetail,
    };
  }
  console.warn('[MediLens Upstream Error]:', fullDetail);
  return {
    status: 500,
    message: 'Upstream Gemini request failed after retries. Please try again shortly.',
    stage: 'gemini_analysis',
    detail: fullDetail,
  };
}

const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function detectImageMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  // HEIC / HEIF: ....ftyp
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand.startsWith('hei') || brand.startsWith('hevx') || brand === 'mif1' || brand === 'msf1') {
      return 'image/heic';
    }
  }
  return null;
}

function validateAndNormalizeImagePayload(
  rawBase64: unknown,
  rawMimeType: unknown
): { base64: string; mimeType: string; decodedBytes: number } {
  if (typeof rawBase64 !== 'string' || !rawBase64.trim()) {
    throw new HttpError(
      400,
      'No image Base64 data was received by the server.',
      'image_transmission'
    );
  }

  let normalizedMime =
    typeof rawMimeType === 'string' ? rawMimeType.trim().toLowerCase() : '';
  if (normalizedMime === 'image/jpg') {
    normalizedMime = 'image/jpeg';
  }

  let base64Body = rawBase64.trim();
  const dataUrlMatch = base64Body.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (dataUrlMatch) {
    const dataUrlMime = dataUrlMatch[1].trim().toLowerCase();
    if (!normalizedMime) {
      normalizedMime = dataUrlMime === 'image/jpg' ? 'image/jpeg' : dataUrlMime;
    }
    base64Body = dataUrlMatch[2];
  }

  base64Body = base64Body.replace(/\s+/g, '');

  if (normalizedMime && !SUPPORTED_IMAGE_MIMES.has(normalizedMime)) {
    throw new HttpError(
      400,
      `Unsupported image MIME type "${normalizedMime}". Use JPEG, PNG, WebP, or HEIC.`,
      'image_transmission'
    );
  }

  if (base64Body.length < 32 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Body)) {
    throw new HttpError(
      400,
      'Image Base64 payload is malformed or truncated during transmission.',
      'image_transmission'
    );
  }

  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length < 128) {
    throw new HttpError(
      400,
      `Decoded image payload is too small (${buffer.length} bytes) to contain a valid photo.`,
      'image_transmission'
    );
  }

  const detectedMime = detectImageMimeFromBuffer(buffer);
  if (!detectedMime) {
    throw new HttpError(
      400,
      'Transmitted Base64 data does not have a valid JPEG, PNG, WebP, or HEIC image header.',
      'image_transmission'
    );
  }

  const effectiveMime = detectedMime || normalizedMime || 'image/jpeg';
  return {
    base64: buffer.toString('base64'),
    mimeType: effectiveMime,
    decodedBytes: buffer.length,
  };
}

function parseJsonLoose<T>(text: string | undefined): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/gi, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}

interface WebSource {
  title: string;
  uri: string;
}

function extractWebSources(response: GenerateContentResponse): WebSource[] {
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const chunk of chunks) {
    const uri = chunk.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({
        title: chunk.web?.title || uri,
        uri,
      });
    }
  }
  return sources;
}

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', async (req: Request, res: Response) => {
  const apiKey = getApiKey();
  const basePayload = {
    ok: true,
    configured: !isPlaceholderOrEmptyKey(apiKey),
    keySource: apiKeySource,
    maskedKey: maskApiKey(apiKey),
    model: activePrimaryModel,
    fallbackModel: activeFallbackModel,
    configuredModel: configuredPrimaryModel,
    configuredFallbackModel: configuredFallbackModel,
  };

  if (req.query.diag !== '1') {
    res.json(basePayload);
    return;
  }

  let listedModels: string[] = [];
  let listError: string | null = null;
  try {
    const ai = getGeminiClient();
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      if (m.name) {
        listedModels.push(m.name.replace(/^models\//, ''));
      }
      if (listedModels.length >= 200) break;
    }
  } catch (err) {
    listError = summarizeUpstreamError(err);
  }

  res.json({
    ...basePayload,
    primaryModelListed: listedModels.includes(activePrimaryModel),
    fallbackModelListed: listedModels.includes(activeFallbackModel),
    listedModelsCount: listedModels.length,
    sampleListedModels: listedModels.slice(0, 50),
    listError,
    recentErrors: recentGeminiErrors.slice(0, 10),
  });
});

app.post('/api/medilens/scan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { imageBase64, mimeType, langName } = req.body ?? {};
    const { base64, mimeType: safeMime, decodedBytes } = validateAndNormalizeImagePayload(
      imageBase64,
      mimeType
    );

    const targetLang = typeof langName === 'string' && langName.trim() ? langName.trim() : 'English';
    const ai = getGeminiClient();

    // Stage 1: Strict Text/Imprint-Only Vision OCR (no search tool so OCR runs strictly on pixels)
    const visionPrompt = `Examine this image carefully. Your ONLY task is to read clearly visible printed medicine text or readable tablet/capsule imprints.

STRICT IDENTIFICATION RULES:
1. Identify the medicine ONLY from clearly visible printed text, brand names, generic active ingredients, strength markings, or clearly legible pill imprints.
2. NEVER guess, infer, or assume a medicine name from packaging color, strip/foil pattern, bottle shape, or tablet color/shape alone.
3. If the text or imprint is blurry, out of focus, obscured, too small, cut off, or not clearly readable enough to be certain of the medicine, you MUST set:
   - "isLegible": false
   - "medicineName": "Unable to identify medicine"
   - "activeIngredients": ""
   - "strength": ""
   - "reason": A clear explanation in ${targetLang} stating why the label cannot be read without guessing.
4. When clearly legible, extract these fields separately:
   - "medicineName": Exact visible brand or medicine name printed on the label (or exact legible imprint if it is a loose imprinted tablet).
   - "activeIngredients": Exact visible active ingredient / salt composition printed on the label (or "Not visible on label" if not printed).
   - "strength": Exact visible strength / concentration (e.g., "500 mg", "250 mg/5 mL", "0.5% w/w", or "Not visible on label").
   - "expiryText": Exact printed expiry date if clearly visible, otherwise "Not clearly visible".
   - "visibleTexts": Verbatim transcription of the readable printed lines on the packaging/tablet.`;

    const visionStartedAt = Date.now();
    const { response: visionResponse, modelUsed: visionModel } = await generateWithFallback(ai, {
      contents: {
        parts: [
          { inlineData: { mimeType: safeMime, data: base64 } },
          { text: visionPrompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isLegible: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
            medicineName: { type: Type.STRING },
            activeIngredients: { type: Type.STRING },
            strength: { type: Type.STRING },
            expiryText: { type: Type.STRING },
            visibleTexts: { type: Type.STRING },
          },
          required: ['isLegible', 'medicineName'],
        },
      },
    });
    const visionDurationMs = Date.now() - visionStartedAt;

    const visionJson = parseJsonLoose<{
      isLegible?: boolean;
      reason?: string;
      medicineName?: string;
      activeIngredients?: string;
      strength?: string;
      expiryText?: string;
      visibleTexts?: string;
    }>(visionResponse.text);

    const rawName = visionJson?.medicineName?.trim() || '';
    const isUnidentified =
      !visionJson ||
      visionJson.isLegible !== true ||
      !rawName ||
      rawName.toLowerCase().includes('unable to identify') ||
      rawName.toLowerCase() === 'unknown' ||
      rawName.toLowerCase() === 'n/a' ||
      rawName.toLowerCase() === 'not visible';

    if (isUnidentified) {
      res.json({
        legible: false,
        medicineName: 'Unable to identify medicine',
        reason:
          visionJson?.reason?.trim() ||
          'The printed medicine name, active ingredients, or imprint could not be read clearly. Please take a sharper, well-lit photo.',
        debug: {
          stage: 'gemini_analysis',
          mimeType: safeMime,
          decodedBytes,
          modelUsed: visionModel,
          visionDurationMs,
        },
      });
      return;
    }

    const medicineName = rawName;
    const activeIngredients =
      visionJson.activeIngredients?.trim() || 'Not visible on label';
    const strength = visionJson.strength?.trim() || 'Not visible on label';
    const expiryText = visionJson.expiryText?.trim() || 'Not clearly visible';
    const visibleTexts = visionJson.visibleTexts?.trim() || medicineName;

    // Stage 2: Grounded Informational Summary (NO dosage recommendations)
    interface MedicalDetailsJson {
      overview?: string;
      expiryGuidance?: string;
      warnings?: string;
    }

    const medicalPrompt = `Provide strictly verified, general informational context in ${targetLang} for the scanned medicine identified from its label:
- Visible Medicine Name: "${medicineName}"
- Active Ingredients: "${activeIngredients}"
- Strength: "${strength}"
- Visible Label Text: "${visibleTexts}"

IMPORTANT SAFETY RULES:
- Do NOT provide, invent, or generate dosage instructions, pill counts, frequency schedules, or age-based dosing recommendations.
- Keep the response purely informational and explicitly remind the user to consult a qualified healthcare professional (doctor or licensed pharmacist) for dosing and medication decisions.

Return ONLY a valid JSON object (no markdown fences) with these exact keys:
{
  "overview": "General informational summary in ${targetLang} of what ${medicineName} (${activeIngredients}) is and its standard therapeutic class/uses.",
  "expiryGuidance": "Short reminder in ${targetLang} about verifying printed expiry ('${expiryText}') and proper storage instructions on the package.",
  "warnings": "Key safety warnings, common precautions, and a clear reminder in ${targetLang} to consult a doctor or pharmacist before starting or changing any medication."
}`;

    let medJson: MedicalDetailsJson | null = null;
    let rawMedText = '';
    let sources: WebSource[] = [];
    let searchGrounded = false;
    let searchModelUsed = visionModel;
    const searchStartedAt = Date.now();

    try {
      const { response: searchResponse, modelUsed } = await generateWithFallback(ai, {
        contents: medicalPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      searchModelUsed = modelUsed;
      rawMedText = searchResponse.text || '';
      medJson = parseJsonLoose<MedicalDetailsJson>(rawMedText);
      sources = extractWebSources(searchResponse);
      searchGrounded = true;
    } catch (searchErr) {
      if (!isQuotaOrTransientError(searchErr)) {
        throw searchErr;
      }
      const { response: fallbackMedResponse, modelUsed } = await generateWithFallback(ai, {
        contents: medicalPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              overview: { type: Type.STRING },
              expiryGuidance: { type: Type.STRING },
              warnings: { type: Type.STRING },
            },
          },
        },
      });
      searchModelUsed = modelUsed;
      rawMedText = fallbackMedResponse.text || '';
      medJson = parseJsonLoose<MedicalDetailsJson>(rawMedText);
      searchGrounded = false;
    }
    const searchDurationMs = Date.now() - searchStartedAt;

    res.json({
      legible: true,
      medicine: {
        medicineName,
        activeIngredients,
        strength,
        expiryText,
        visibleTexts,
        overview:
          medJson?.overview ||
          rawMedText ||
          `${medicineName} (${activeIngredients}, ${strength}). Consult a qualified healthcare professional for full prescribing information.`,
        expiryGuidance:
          medJson?.expiryGuidance ||
          `Label expiry: ${expiryText}. Always verify the printed expiry date on the original pack before use.`,
        warnings:
          medJson?.warnings ||
          'Consult a licensed doctor or pharmacist before taking this medication or making any treatment decisions.',
        sources,
      },
      debug: {
        stage: 'gemini_analysis',
        mimeType: safeMime,
        decodedBytes,
        modelUsed: `${visionModel} / ${searchModelUsed}`,
        visionDurationMs,
        searchDurationMs,
        searchGrounded,
      },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/medilens/pharmacies', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { medicineName, latitude, longitude, langName } = req.body ?? {};
    const targetLang = typeof langName === 'string' && langName.trim() ? langName.trim() : 'English';
    const medQuery =
      typeof medicineName === 'string' && medicineName.trim() ? medicineName.trim() : 'medicine';

    const lat = Number.isFinite(Number(latitude)) ? Number(latitude) : 22.5726;
    const lng = Number.isFinite(Number(longitude)) ? Number(longitude) : 88.3639;

    const ai = getGeminiClient();

    const prompt = `Find nearby pharmacies and medical stores around these coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}) where a patient can check for "${medQuery}".
Respond in ${targetLang}.
List both currently OPEN pharmacies and currently CLOSED pharmacies if hours are available, clearly stating OPEN NOW, CLOSED, or hours unknown alongside each store's name and area.`;

    let summaryText = '';
    const seen = new Set<string>();
    const places: Array<{
      title: string;
      uri: string;
      openNow: boolean | null;
      snippet?: string;
    }> = [];

    try {
      const { response } = await generateWithFallback(ai, {
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: lat,
                longitude: lng,
              },
            },
          },
        },
      });

      summaryText = response.text || '';
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      for (const chunk of chunks) {
        const mapsChunk = chunk.maps as
          | {
              title?: string;
              uri?: string;
              openNow?: boolean;
              placeAnswerSources?: { reviewSnippets?: Array<{ content?: string }> };
            }
          | undefined;
        if (!mapsChunk || (!mapsChunk.title && !mapsChunk.uri)) continue;

        const title = mapsChunk.title || 'Nearby Pharmacy';
        const uri =
          mapsChunk.uri ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${title} pharmacy`)}`;

        if (seen.has(uri)) continue;
        seen.add(uri);

        const snippet = mapsChunk.placeAnswerSources?.reviewSnippets?.[0]?.content;
        places.push({
          title,
          uri,
          openNow: typeof mapsChunk.openNow === 'boolean' ? mapsChunk.openNow : null,
          snippet,
        });
      }
    } catch (mapsErr) {
      if (isInvalidApiKeyError(mapsErr) || isApiNotEnabledOrRestrictedError(mapsErr)) {
        throw mapsErr;
      }

      // Free-tier keys or some models may not have Google Maps grounding quota;
      // fall back to standard Gemini generation + direct Google Maps search links.
      const fallbackPrompt = `A patient near coordinates (${lat.toFixed(4)}, ${lng.toFixed(4)}) wants to find nearby pharmacies / medical stores to check for "${medQuery}".
Respond in ${targetLang}.
Return ONLY a JSON object with:
{
  "summaryText": "Brief helpful guidance in ${targetLang} listing major local pharmacy chains / 24-hour medical store options near this area and reminding the user to tap Google Maps to verify live open/closed hours.",
  "places": [
    {
      "title": "Pharmacy or well-known pharmacy chain name near this area",
      "area": "City / neighborhood name near (${lat.toFixed(4)}, ${lng.toFixed(4)})",
      "snippet": "Short note in ${targetLang} (e.g., check live hours on Google Maps)"
    }
  ]
}
Include 3 to 5 realistic pharmacy search entries for the city/region at (${lat.toFixed(4)}, ${lng.toFixed(4)}).`;

      const { response: fallbackResp } = await generateWithFallback(ai, {
        contents: fallbackPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryText: { type: Type.STRING },
              places: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    area: { type: Type.STRING },
                    snippet: { type: Type.STRING },
                  },
                  required: ['title'],
                },
              },
            },
          },
        },
      });

      const parsed = parseJsonLoose<{
        summaryText?: string;
        places?: Array<{ title?: string; area?: string; snippet?: string }>;
      }>(fallbackResp.text);

      summaryText =
        parsed?.summaryText ||
        `Live Google Maps grounding is unavailable on the current API tier. Use the Google Maps links below to check currently open pharmacies near ${lat.toFixed(4)}, ${lng.toFixed(4)}.`;

      for (const item of parsed?.places ?? []) {
        const title = item.title?.trim();
        if (!title) continue;
        const query = item.area ? `${title} pharmacy ${item.area}` : `${title} pharmacy`;
        const uri = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
        if (seen.has(uri)) continue;
        seen.add(uri);
        places.push({
          title,
          uri,
          openNow: null,
          snippet: item.snippet?.trim() || (item.area ? `${item.area} · Check live hours on Maps` : undefined),
        });
      }

      if (places.length === 0) {
        places.push({
          title: 'Nearby Pharmacies (Open Now)',
          uri: `https://www.google.com/maps/search/pharmacy/@${lat.toFixed(4)},${lng.toFixed(4)},14z`,
          openNow: null,
          snippet: 'Open Google Maps to check live pharmacy hours near these coordinates.',
        });
      }
    }

    res.json({
      summaryText,
      places,
      coordinates: { lat, lng },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/medilens/chat', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, medicineContext, langName } = req.body ?? {};
    if (typeof question !== 'string' || !question.trim()) {
      throw new HttpError(400, 'Please enter or speak a question.', 'image_transmission');
    }

    const targetLang = typeof langName === 'string' && langName.trim() ? langName.trim() : 'English';

    const medSummary = medicineContext
      ? `Scanned medicine: ${medicineContext.medicineName || 'Unknown'} | Active ingredients: ${medicineContext.activeIngredients || 'N/A'} | Strength: ${medicineContext.strength || 'N/A'}. Overview: ${medicineContext.overview || 'N/A'}. Warnings: ${medicineContext.warnings || 'N/A'}.`
      : 'No medicine has been scanned yet.';

    const ai = getGeminiClient();

    const chatContents = `${medSummary}
User question: "${question.trim()}"`;
    const systemInstruction = `You are MediLens's informational medicine reference assistant. Answer clearly, concisely, and accurately in ${targetLang}. Keep responses strictly informational: NEVER prescribe, recommend, or calculate personal dosages. Always direct users to a qualified doctor or licensed pharmacist for dosing and medication decisions.`;

    let response: GenerateContentResponse;
    try {
      const result = await generateWithFallback(ai, {
        contents: chatContents,
        config: {
          tools: [{ googleSearch: {} }],
          systemInstruction,
        },
      });
      response = result.response;
    } catch (searchErr) {
      if (!isQuotaOrTransientError(searchErr)) {
        throw searchErr;
      }
      const result = await generateWithFallback(ai, {
        contents: chatContents,
        config: {
          systemInstruction,
        },
      });
      response = result.response;
    }

    res.json({
      reply: response.text || 'I could not find an answer right now. Please consult a qualified doctor or pharmacist.',
      sources: extractWebSources(response),
    });
  } catch (err) {
    next(err);
  }
});

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found.', stage: 'image_transmission' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const mapped = mapGeminiError(err);
  res.status(mapped.status).json({
    error: mapped.message,
    stage: mapped.stage,
    debug: mapped.detail ? { stage: mapped.stage, detail: mapped.detail } : { stage: mapped.stage },
  });
});

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  await resolveStartupModels();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MediLens server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
