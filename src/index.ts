/**
 * amazon-scraper-api-sdk — Node.js / TypeScript client for
 * https://amazonscraperapi.com
 *
 * Zero-config usage:
 *   import { AmazonScraperAPI } from 'amazon-scraper-api-sdk';
 *   const client = new AmazonScraperAPI(process.env.ASA_API_KEY);
 *   const product = await client.product({ query: 'B09HN3Q81F', domain: 'com' });
 */

export interface AmazonProductParams {
  query: string;
  domain?: AmazonDomain;
  language?: string;
  add_html?: boolean;
}

export interface AmazonSearchParams {
  query: string;
  domain?: AmazonDomain;
  sort_by?: 'best_match' | 'price_asc' | 'price_desc' | 'avg_customer_review' | 'newest';
  start_page?: number;
  pages?: number;
}

export type AmazonDomain =
  | 'com' | 'co.uk' | 'de' | 'fr' | 'it' | 'es' | 'nl' | 'pl' | 'se' | 'ca'
  | 'com.mx' | 'com.br' | 'com.au' | 'co.jp' | 'sg' | 'in' | 'com.tr' | 'ae' | 'sa' | 'eg';

export interface BatchCreateParams {
  endpoint: 'amazon.product' | 'amazon.search';
  items: Array<Record<string, unknown>>;
  webhook_url?: string;
}

export interface BatchCreateResponse {
  id: string;
  status: 'pending';
  total_count: number;
  created_at: string;
  webhook_signature_secret?: string;
  poll_url: string;
}

export interface BatchStatusResponse {
  id: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  endpoint: string;
  total_count: number;
  processed_count: number;
  success_count: number;
  failure_count: number;
  credits_charged: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  webhook_url: string | null;
  webhook_delivered_at: string | null;
  results: Array<{ input: unknown; status: 'ok' | 'error'; data?: unknown; error?: string }>;
}

export interface AmazonScraperAPIOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class AmazonScraperAPIError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'AmazonScraperAPIError';
  }
}

export class AmazonScraperAPI {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(apiKey: string, opts: AmazonScraperAPIOptions = {}) {
    if (!apiKey) throw new Error('AmazonScraperAPI: apiKey is required');
    this.apiKey = apiKey;
    this.baseUrl = (opts.baseUrl ?? 'https://api.amazonscraperapi.com').replace(/\/$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  /** GET /v1/amazon/product */
  async product(params: AmazonProductParams): Promise<any> {
    return this.request('GET', '/api/v1/amazon/product', params as unknown as Record<string, unknown>);
  }

  /** GET /v1/amazon/search */
  async search(params: AmazonSearchParams): Promise<any> {
    return this.request('GET', '/api/v1/amazon/search', params as unknown as Record<string, unknown>);
  }

  /** POST /v1/amazon/batch — create an async batch. */
  async createBatch(params: BatchCreateParams): Promise<BatchCreateResponse> {
    return this.request('POST', '/api/v1/amazon/batch', undefined, params);
  }

  /** GET /v1/amazon/batch/:id — fetch current batch status. */
  async getBatch(id: string): Promise<BatchStatusResponse> {
    return this.request('GET', `/api/v1/amazon/batch/${encodeURIComponent(id)}`);
  }

  /** GET /v1/amazon/batch — list your recent batches. */
  async listBatches(limit = 20): Promise<{ batches: any[] }> {
    return this.request('GET', '/api/v1/amazon/batch', { limit });
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    queryParams?: Record<string, unknown>,
    jsonBody?: unknown
  ): Promise<any> {
    const url = new URL(this.baseUrl + path);
    if (queryParams) {
      for (const [k, v] of Object.entries(queryParams)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'User-Agent': 'amazon-scraper-api-sdk-node/0.1.0',
          ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body: jsonBody ? JSON.stringify(jsonBody) : undefined,
        signal: ctrl.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new AmazonScraperAPIError(res.status, body, `HTTP ${res.status}: ${body?.error ?? 'request failed'}`);
      }
      return body;
    } finally {
      clearTimeout(to);
    }
  }
}

/** Helper: verify an inbound webhook signature from our batch endpoint. */
export async function verifyWebhookSignature(
  signatureHeader: string | null | undefined,
  rawBody: string | Buffer | Uint8Array,
  secret: string
): Promise<boolean> {
  if (!signatureHeader) return false;
  const crypto = await import('node:crypto');
  const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf-8') : Buffer.from(rawBody as Uint8Array);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
