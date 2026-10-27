# amazon-scraper-api-sdk

[![npm](https://img.shields.io/npm/v/amazon-scraper-api-sdk)](https://www.npmjs.com/package/amazon-scraper-api-sdk)
[![npm downloads](https://img.shields.io/npm/dm/amazon-scraper-api-sdk)](https://www.npmjs.com/package/amazon-scraper-api-sdk)
[![license](https://img.shields.io/npm/l/amazon-scraper-api-sdk)](./LICENSE)

Official Node.js / TypeScript SDK for **[Amazon Scraper API](https://www.amazonscraperapi.com/)**. Pay only for successful (2xx) responses — non-2xx never cost you anything. Pricing starts at $0.90 per 1,000 requests on pay-as-you-go, drops to a flat **$0.50 per 1,000 requests** on Custom plans. 1,000 free requests on signup, no card. Drop into any Node.js project to fetch structured Amazon product data, run keyword searches, or queue async batches with webhook callbacks.

## Benchmark (live production, 2026-04)

Measured on our own infrastructure against a 30-query mixed international set:

| Metric | Value |
|---|---|
| Median latency (product, US) | **~2.6 s** |
| P95 latency | **~6 s** |
| P99 latency | ~10.5 s |
| Price / 1,000 Amazon products | **$0.50** flat |
| Concurrent threads (entry paid plan) | **50** |
| Marketplaces supported | **20+** |
| Billing unit | per successful (2xx) response |

---

## Install

```bash
npm install amazon-scraper-api-sdk
```

Requires Node >= 18. ESM package (from CommonJS, use `await import('amazon-scraper-api-sdk')`). TypeScript types included.

## Quick start - single product

```typescript
import { AmazonScraperAPI } from 'amazon-scraper-api-sdk';

const asa = new AmazonScraperAPI(process.env.ASA_API_KEY!);

const product = await asa.product({ query: 'B09HN3Q81F', domain: 'com' });

console.log(product.title);
// "LEGEND COOKWARE 5-Ply Stainless Steel Cookware Set, 14-Piece..."
console.log(product.price, product.currency);
// 549.99 USD
console.log(product.rating, product.reviews_count);
// 4.5 865
```

### Example output (trimmed, ~55 fields in total)

```json
{
  "asin": "B09HN3Q81F",
  "title": "LEGEND COOKWARE 5-Ply Stainless Steel Cookware Set, 14-Piece...",
  "brand": "LEGEND COOKWARE",
  "price": 549.99,
  "price_strikethrough": null,
  "currency": "USD",
  "rating": 4.5,
  "reviews_count": 865,
  "stock": "In Stock",
  "is_prime": true,
  "images": ["https://m.media-amazon.com/images/I/71Q3a8JH5NL._AC_SY355_.jpg", "..."],
  "bullet_points": "5-PLY STAINLESS STEEL COOKWARE HEATS EVENLY - Five layers of steel...",
  "sales_rank": [
    { "ladder": [{ "name": "Kitchen & Dining", "url": null }], "rank": 36177 },
    { "ladder": [{ "name": "Kitchen Cookware Sets", "url": null }], "rank": 174 }
  ]
}
```

## Keyword search

```typescript
const results = await asa.search({
  query: 'wireless headphones',
  domain: 'co.uk',
  sort_by: 'avg_customer_review',
  start_page: 1, // one page per call; increment to paginate
});

for (const p of results.products) {
  // Sponsored cards have sponsored_position instead of organic_position.
  console.log(p.organic_position, p.asin, p.title, p.price, p.rating, p.reviews_count);
}
```

## Async batch (up to 1,000 ASINs with webhook callback)

```typescript
const batch = await asa.createBatch({
  endpoint: 'amazon.product',
  items: [
    { query: 'B09HN3Q81F', domain: 'com' },
    { query: 'B000ALVUM6', domain: 'de', language: 'de_DE' },
    // ... up to 1,000 items
  ],
  webhook_url: 'https://your.server/webhooks/asa',
});

console.log('batch id:', batch.id);
// SAVE THIS. The webhook signing secret is returned only once:
console.log('webhook secret:', batch.webhook_signature_secret);

// Alternatively poll:
const status = await asa.getBatch(batch.id);
console.log(`${status.processed_count}/${status.total_count} processed`);
```

## Verifying webhook signatures

Every webhook POST carries `X-ASA-Signature: sha256=<hmac-hex>` over the raw body (same pattern as Stripe / GitHub):

```typescript
import { verifyWebhookSignature } from 'amazon-scraper-api-sdk';

// Express / Fastify / Hono. Read the RAW body, not the parsed JSON.
app.post('/webhooks/asa', async (req, res) => {
  const signature = req.header('X-ASA-Signature');
  const rawBody = req.rawBody;
  const valid = await verifyWebhookSignature(signature, rawBody, process.env.WEBHOOK_SECRET!);
  if (!valid) return res.status(401).send('invalid signature');
  const { id, status, results } = req.body;
  // process results safely
});
```

## What the API solves for you

Building a production-grade Amazon scraper in-house is a 2-4 week engineering sprint plus permanent 10-20% maintenance overhead. This SDK wraps [Amazon Scraper API](https://www.amazonscraperapi.com/), which has already solved:

| Pain point | What we handle |
|---|---|
| **Amazon CAPTCHAs / robot pages** | Auto-detected, retried through a heavier proxy tier (datacenter, residential, premium). You never see them. |
| **Brittle CSS selectors** | Extractor library updates as Amazon changes layouts. Your code doesn't care. |
| **20+ marketplaces** | `amazon.de`, `.co.uk`, `.co.jp`, `.com.br`, and more. Marketplace-specific parsing (language, currency, layout) handled. Pass `domain: 'de'`, done. |
| **Country-matched residential IPs** | For non-US targets we auto-route through IPs in that country (`amazon.de` uses German residential). Override with `country: 'DE'`. |
| **Rotating proxies + anti-fingerprinting** | TLS fingerprints, headers, cookie handling. You never configure a proxy. |
| **Structured JSON output** | Title, price, rating, reviews, variants, seller, images, categories. All parsed, typed. No `BeautifulSoup` selectors. |
| **Batch/async jobs** | Submit 1,000 ASINs, get a webhook when done. |

**Time saved:** a greenfield Node.js Amazon scraper built to this feature set takes roughly 80 engineer-hours. This SDK is 10 minutes.

## Error handling

Every failed call throws an `AmazonScraperAPIError` with `status` (HTTP status), `code` (the API's error code, or `null`) and `body` (the parsed JSON body). The SDK does not retry on its own, so `switch` on `err.code` and decide:

```typescript
import { AmazonScraperAPIError } from 'amazon-scraper-api-sdk';

try {
  await asa.product({ query: 'B09HN3Q81F', domain: 'com' });
} catch (err) {
  if (!(err instanceof AmazonScraperAPIError)) throw err;
  if (err.code === 'INSUFFICIENT_CREDITS') {
    // top up
  } else if (err.code === 'RATE_LIMITED') {
    await sleep((err.body as any)?.error?.retry_after_ms ?? 1000);
  } else if (err.code === 'target_unreachable') {
    await sleep(60_000); // then retry once
  } else {
    throw err;
  }
}
```

| HTTP | `code` | When you see it | Recommended client action |
|---|---|---|---|
| 400 | `invalid_params` | Missing `query`, unsupported `domain`, invalid `sort_by` | Fix request, don't retry |
| 401 | `INVALID_API_KEY` | Missing, malformed, or revoked key | Verify `ASA_API_KEY` env; rotate if leaked |
| 402 | `INSUFFICIENT_CREDITS` | Credit balance empty | Top up; balance refreshed on renewal |
| 404 | `product_not_found` | ASIN delisted, malformed, or not on this marketplace | Don't retry; drop the ASIN |
| 429 | `RATE_LIMITED` | Over request-rate budget | Wait `error.retry_after_ms`, then retry |
| 429 | `CONCURRENCY_LIMIT` | Over plan's parallel-thread cap | Drop parallelism or upgrade plan. `X-Concurrency-Limit` + `X-Concurrency-Remaining` headers guide backoff |
| 502 | `target_unreachable` | Amazon blocked every internal retry (`last_block_reason` says why) | Retry after 60s or more. Not charged |
| 502 | `extraction_failed` | Amazon returned a page we can't parse | Retry later; report with `X-Request-Id` if it persists. Not charged |
| 503 | `SERVICE_OVERLOADED` | Global circuit breaker tripped | Honor `Retry-After: 60`. Rare; alerts us automatically |
| 500 | `INTERNAL_ERROR` | Our bug | Report with `X-Request-Id` |

The default request timeout is 120s (the API's own ceiling); override it with `new AmazonScraperAPI(key, { timeoutMs })`.

**Flat-credit promise:** all non-2xx responses are free. A basic request costs 5 credits (billing unit; end-customer price is $0.90 per 1,000 basic requests PAYG). Future JS-rendered calls will cost 15 credits. `X-Request-Id` header is returned on every response — paste it in any support ticket and we'll trace the request in under a minute.

## API reference (typed)

```typescript
class AmazonScraperAPI {
  constructor(apiKey: string, opts?: { baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch });

  product(params: {
    query: string;                            // ASIN or Amazon URL
    domain?: 'com' | 'co.uk' | 'de' | string; // 20 marketplaces
    language?: string;                        // 'en_US', 'de_DE', etc.
    add_html?: boolean;                       // include raw HTML in response
    country?: string;                         // residential IP country (ISO-2)
  }): Promise<any>;                           // product JSON, ~55 fields

  search(params: {
    query: string;
    domain?: AmazonDomain;
    sort_by?: 'best_match' | 'price_asc' | 'price_desc' | 'avg_customer_review' | 'newest';
    start_page?: number;                      // 1-based; one page per call
    pages?: number;                           // accepted but currently ignored
  }): Promise<any>;                           // { page, products: [...] }

  createBatch(params: {
    endpoint: 'amazon.product' | 'amazon.search';
    items: Array<Record<string, unknown>>;
    webhook_url?: string;
  }): Promise<BatchCreateResponse>;

  getBatch(id: string): Promise<BatchStatusResponse>;
}
```

## Get an API key

[app.amazonscraperapi.com](https://app.amazonscraperapi.com). **1,000 free requests on signup, no credit card required.**

## Links

- **Website:** https://www.amazonscraperapi.com/
- **Docs:** https://amazonscraperapi.com/docs
- **Pricing:** https://amazonscraperapi.com/pricing
- **Support:** [info@amazonscraperapi.com](mailto:info@amazonscraperapi.com) (quote the `X-Request-Id` header for fastest debugging)
- **Python SDK:** [amazonscraperapi-sdk](https://pypi.org/project/amazonscraperapi-sdk/) · **Go SDK:** [github.com/ChocoData-com/amazon-scraper-api-sdk-go](https://github.com/ChocoData-com/amazon-scraper-api-sdk-go) · **CLI:** [amazon-scraper-api-cli](https://www.npmjs.com/package/amazon-scraper-api-cli) · **MCP server:** [amazon-scraper-api-mcp](https://www.npmjs.com/package/amazon-scraper-api-mcp)

## License

MIT
