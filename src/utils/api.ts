import { ScanDebugInfo, ScanStage } from '../types/medilens';

export class ApiRequestError extends Error {
  stage: ScanStage;
  status?: number;
  debug?: Partial<ScanDebugInfo>;

  constructor(
    message: string,
    stage: ScanStage = 'image_transmission',
    status?: number,
    debug?: Partial<ScanDebugInfo>
  ) {
    super(message);
    this.stage = stage;
    this.status = status;
    this.debug = debug;
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network error';
    throw new ApiRequestError(
      `Could not reach ${url}: ${detail}`,
      'image_transmission'
    );
  }

  const rawText = await res.text();
  const contentType = res.headers.get('content-type') || '';

  let parsed: (T & { error?: string; stage?: ScanStage; debug?: Partial<ScanDebugInfo> }) | null =
    null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as T & {
        error?: string;
        stage?: ScanStage;
        debug?: Partial<ScanDebugInfo>;
      };
    } catch {
      parsed = null;
    }
  }

  if (!parsed) {
    const looksLikeHtml =
      contentType.includes('text/html') || /^\s*<!doctype|^\s*<html/i.test(rawText);
    if (looksLikeHtml) {
      throw new ApiRequestError(
        `API endpoint (${url}) returned HTML instead of JSON (HTTP ${res.status}). Make sure the full-stack server is running.`,
        'image_transmission',
        res.status
      );
    }
    throw new ApiRequestError(
      `Unexpected non-JSON response from ${url} (HTTP ${res.status}).`,
      'image_transmission',
      res.status
    );
  }

  if (!res.ok) {
    const inferredStage: ScanStage =
      parsed.stage ??
      (res.status === 400 || res.status === 413 ? 'image_transmission' : 'gemini_analysis');
    throw new ApiRequestError(
      parsed.error || `Request failed with status ${res.status}.`,
      inferredStage,
      res.status,
      parsed.debug
    );
  }

  return parsed;
}
