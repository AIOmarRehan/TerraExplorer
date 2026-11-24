// TerraExplorer API Worker
//
// Keeps the Gemini and Unsplash credentials on the server. The browser only
// receives the Worker URL (a public value) and never an API key.
//
// Routes:
//   GET  /                 service metadata
//   GET  /api/health       configuration health (no secrets)
//   POST /api/ai           { "country": "France" } -> { funFact, dish }
//   GET  /api/photos       ?query=France&page=1 -> { totalPages, photos[] }
//
// Required secrets (set with `wrangler secret put`):
//   GEMINI_API_KEY
//   UNSPLASH_ACCESS_KEY
//
// Optional vars:
//   ALLOWED_ORIGINS         comma-separated browser origins
//   GEMINI_MODELS           comma-separated model fallback list
//   UNSPLASH_UTM_SOURCE     attribution campaign source

const DEFAULT_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite-preview'
];

const DEFAULT_ALLOWED_ORIGINS = [
  'https://aiomarrehan.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

const MAX_COUNTRY_LENGTH = 80;
const MAX_BODY_BYTES = 1024;
const AI_CACHE_TTL_SECONDS = 86400;
const PHOTO_CACHE_TTL_SECONDS = 300;
const GEMINI_TIMEOUT_MS = 9000;
const UNSPLASH_TIMEOUT_MS = 10000;
const MAX_PHOTO_PAGE = 50;

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), microphone=()',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

class HttpError extends Error {
  constructor(status, message, retryable = false) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryable = retryable;
  }
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders
    }
  });
}

function normalizePath(pathname) {
  const trimmed = String(pathname || '/').replace(/\/+$/, '');
  return trimmed || '/';
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(String(value).trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return parsed.origin;
  } catch (_) {
    return '';
  }
}

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(request, env, url) {
  const origin = request.headers.get('Origin');
  if (!origin) return { Vary: 'Origin' };

  const normalized = normalizeOrigin(origin);
  const allowed = getAllowedOrigins(env);
  const isSameOrigin = normalized && normalized === url.origin;

  if (!normalized || (!isSameOrigin && !allowed.includes(normalized))) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': normalized,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function validateCountry(value) {
  if (typeof value !== 'string') return null;
  const country = value.trim().replace(/\s+/g, ' ');
  if (country.length < 2 || country.length > MAX_COUNTRY_LENGTH) return null;

  // Letters (any language), combining marks, spaces and common name punctuation.
  // Quotes, angle brackets, slashes, control characters and newlines are rejected.
  if (!/^[\p{L}\p{M} .'’()\-,&]+$/u.test(country)) return null;
  return country;
}

function parsePage(value) {
  const page = Number.parseInt(value, 10);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(page, MAX_PHOTO_PAGE);
}

function getModels(env) {
  const configured = String(env.GEMINI_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter((model) => /^[a-z0-9][a-z0-9.-]{1,63}$/i.test(model));
  return configured.length ? configured : DEFAULT_MODELS;
}

function cleanText(value, maxLength = 600) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeAiResult(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const funFact = cleanText(value.funFact);
  const dish = cleanText(value.dish);
  if (!funFact || !dish) return null;
  return { funFact, dish };
}

function parseGeminiResponse(data) {
  if (!data || !Array.isArray(data.candidates) || !data.candidates[0]) return null;
  const candidate = data.candidates[0];
  if (!candidate.content || !Array.isArray(candidate.content.parts)) return null;

  const text = candidate.content.parts
    .filter((part) => part && part.thought !== true && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');

  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last <= first) return null;

  try {
    return normalizeAiResult(JSON.parse(cleaned.slice(first, last + 1)));
  } catch (_) {
    return null;
  }
}

function safeUnsplashImageUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'images.unsplash.com' && url.hostname !== 'plus.unsplash.com') return '';
    return url.toString();
  } catch (_) {
    return '';
  }
}

function safeUnsplashPageUrl(value, utmSource) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return '';
    if (url.hostname !== 'unsplash.com' && url.hostname !== 'www.unsplash.com') return '';
    url.searchParams.set('utm_source', utmSource);
    url.searchParams.set('utm_medium', 'referral');
    return url.toString();
  } catch (_) {
    return '';
  }
}

function safeUnsplashId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : '';
}

function safeColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : null;
}

function safeDimension(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 100000 ? number : null;
}

function sanitizePhotosResponse(data, utmSource) {
  const results = data && Array.isArray(data.results) ? data.results : [];
  const photos = results
    .slice(0, 20)
    .map((photo) => {
      if (!photo || typeof photo !== 'object') return null;
      const small = safeUnsplashImageUrl(photo.urls && photo.urls.small);
      const regular = safeUnsplashImageUrl(photo.urls && photo.urls.regular);
      if (!small || !regular) return null;

      const user = photo.user && typeof photo.user === 'object' ? photo.user : {};
      const userName = cleanText(user.name, 120) || 'Unsplash contributor';
      const userLink = safeUnsplashPageUrl(user.links && user.links.html, utmSource);
      const pageUrl = safeUnsplashPageUrl(photo.links && photo.links.html, utmSource);

      return {
        id: safeUnsplashId(photo.id),
        small,
        regular,
        alt: cleanText(photo.alt_description || photo.description, 240) || 'Travel photo',
        width: safeDimension(photo.width),
        height: safeDimension(photo.height),
        color: safeColor(photo.color),
        userName,
        userLink,
        pageUrl
      };
    })
    .filter(Boolean);

  const totalPages = Number.parseInt(data && data.total_pages, 10);
  return {
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? Math.min(totalPages, MAX_PHOTO_PAGE) : 1,
    photos
  };
}

function aiCacheKey(country) {
  return new Request(
    'https://terraexplorer-cache.invalid/ai?country=' + encodeURIComponent(country.toLowerCase()),
    { method: 'GET' }
  );
}

function getCache() {
  try {
    return globalThis.caches && globalThis.caches.default ? globalThis.caches.default : null;
  } catch (_) {
    return null;
  }
}

async function readCachedAi(country) {
  const cache = getCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(aiCacheKey(country));
    if (!hit) return null;
    return normalizeAiResult(await hit.json());
  } catch (_) {
    return null;
  }
}

async function writeCachedAi(country, value) {
  const cache = getCache();
  if (!cache) return;
  try {
    await cache.put(
      aiCacheKey(country),
      new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=' + AI_CACHE_TTL_SECONDS
        }
      })
    );
  } catch (_) {
    // Cache is an optimization only; never fail a request because of it.
  }
}

async function readJsonBody(request) {
  const contentType = String(request.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json.');
  }

  const declaredLength = Number.parseInt(request.headers.get('Content-Length') || '0', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new HttpError(413, 'Request body is too large.');
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request body is too large.');

  let body;
  try {
    body = JSON.parse(text);
  } catch (_) {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
  return body;
}

async function requestGemini(country, env) {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, 'AI service is not configured.');
  }

  const prompt = [
    'You are a geography and culture expert.',
    'For the country ' + JSON.stringify(country) + ' specifically (and no other country), provide:',
    '1. One unique, surprising, and ACCURATE fun fact specific only to ' + country + '.',
    '2. One authentic traditional local dish that originates from ' + country + ', with a brief description.',
    'Respond ONLY with valid JSON, with no markdown and no explanation:',
    '{ "funFact": "...", "dish": "..." }'
  ].join('\n');

  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 1024 }
  });

  const models = getModels(env);
  let lastStatus = 0;
  let sawInvalidResponse = false;

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' +
          encodeURIComponent(model) +
          ':generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': env.GEMINI_API_KEY
          },
          body,
          signal: controller.signal
        }
      );

      lastStatus = response.status;

      if (response.status === 401 || response.status === 403) {
        throw new HttpError(503, 'AI service is not configured correctly.');
      }

      if (!response.ok) {
        // 429/5xx are worth trying on the next model. Other client errors are not.
        if (response.status === 429 || response.status >= 500) continue;
        break;
      }

      const data = await response.json();
      const parsed = parseGeminiResponse(data);
      if (parsed) return { result: parsed, model };
      sawInvalidResponse = true;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error && error.name === 'AbortError') {
        lastStatus = 504;
        continue;
      }
      // Network error: try the next model.
      lastStatus = 502;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (sawInvalidResponse) {
    throw new HttpError(502, 'AI returned an invalid response. Please try again.');
  }
  if (lastStatus === 429) {
    throw new HttpError(503, 'AI service is busy. Please try again shortly.', true);
  }
  throw new HttpError(503, 'AI service is temporarily unavailable. Please try again shortly.', true);
}

async function requestPhotos(query, page, env) {
  if (!env.UNSPLASH_ACCESS_KEY) {
    throw new HttpError(503, 'Photo service is not configured.');
  }

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', '20');
  url.searchParams.set('content_filter', 'high');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UNSPLASH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: 'Client-ID ' + env.UNSPLASH_ACCESS_KEY,
        'Accept-Version': 'v1',
        'User-Agent': 'TerraExplorer/1.0 (https://aiomarrehan.github.io/TerraExplorer/)'
      },
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      throw new HttpError(503, 'Photo service is not configured correctly.');
    }
    if (response.status === 429) {
      throw new HttpError(503, 'Photo service is busy. Please try again shortly.', true);
    }
    if (!response.ok) {
      throw new HttpError(503, 'Photo service is temporarily unavailable.', true);
    }

    const data = await response.json();
    const utmSource = String(env.UNSPLASH_UTM_SOURCE || 'terraexplorer');
    return sanitizePhotosResponse(data, utmSource);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error && error.name === 'AbortError') {
      throw new HttpError(503, 'Photo service timed out. Please try again.', true);
    }
    throw new HttpError(503, 'Photo service is temporarily unavailable.', true);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkLimit(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return true;
  try {
    const result = await binding.limit({ key });
    return !result || result.success !== false;
  } catch (_) {
    // Do not turn a limiter outage into a total API outage.
    console.error('rate-limiter-unavailable');
    return true;
  }
}

async function enforceRateLimits(request, env, route) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const perIpBinding = route === 'ai' ? env.AI_RATE_LIMITER : env.PHOTOS_RATE_LIMITER;
  const globalBinding = route === 'ai' ? env.AI_GLOBAL_RATE_LIMITER : env.PHOTOS_GLOBAL_RATE_LIMITER;

  if (!(await checkLimit(perIpBinding, route + ':ip:' + ip))) return false;
  if (globalBinding && !(await checkLimit(globalBinding, route + ':global'))) return false;
  return true;
}

export async function handleRequest(request, env, ctx = {}) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const cors = corsHeaders(request, env, url);

  try {
    if (request.headers.get('Origin') && !cors) {
      return json({ error: 'Origin not allowed.' }, 403);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...BASE_HEADERS, ...(cors || {}) }
      });
    }

    if (path === '/' && request.method === 'GET') {
      return json({
        service: 'TerraExplorer API',
        endpoints: ['/api/health', '/api/ai', '/api/photos']
      }, 200, cors || {});
    }

    if (path === '/api/health' && request.method === 'GET') {
      return json({
        ok: true,
        aiConfigured: Boolean(env.GEMINI_API_KEY),
        photosConfigured: Boolean(env.UNSPLASH_ACCESS_KEY)
      }, 200, cors || {});
    }

    if (path === '/api/ai') {
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed.' }, 405, { ...(cors || {}), Allow: 'POST, OPTIONS' });
      }
      if (!(await enforceRateLimits(request, env, 'ai'))) {
        return json({ error: 'Too many requests. Please try again in a minute.' }, 429, {
          ...(cors || {}),
          'Retry-After': '60'
        });
      }

      const body = await readJsonBody(request);
      const country = validateCountry(body.country);
      if (!country) {
        return json({
          error: 'Provide a valid country name (2-80 letters and common punctuation).'
        }, 400, cors || {});
      }

      const cached = await readCachedAi(country);
      if (cached) return json(cached, 200, { ...(cors || {}), 'Cache-Control': 'no-store' });

      const generated = await requestGemini(country, env);
      const cacheWrite = writeCachedAi(country, generated.result);
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cacheWrite);
      else await cacheWrite;

      return json(generated.result, 200, { ...(cors || {}), 'Cache-Control': 'no-store' });
    }

    if (path === '/api/photos') {
      if (request.method !== 'GET') {
        return json({ error: 'Method not allowed.' }, 405, { ...(cors || {}), Allow: 'GET, OPTIONS' });
      }
      if (!(await enforceRateLimits(request, env, 'photos'))) {
        return json({ error: 'Too many requests. Please try again in a minute.' }, 429, {
          ...(cors || {}),
          'Retry-After': '60'
        });
      }

      const query = validateCountry(url.searchParams.get('query'));
      if (!query) {
        return json({
          error: 'Provide a valid photo search query (2-80 letters and common punctuation).'
        }, 400, cors || {});
      }

      const page = parsePage(url.searchParams.get('page'));
      const result = await requestPhotos(query, page, env);
      return json(result, 200, {
        ...(cors || {}),
        'Cache-Control': 'public, max-age=' + PHOTO_CACHE_TTL_SECONDS
      });
    }

    return json({ error: 'Not found.' }, 404, cors || {});
  } catch (error) {
    if (error instanceof HttpError) {
      return json(
        { error: error.message, retryable: error.retryable },
        error.status,
        cors || {}
      );
    }
    console.error('unhandled-api-error', {
      path,
      message: error && error.message ? error.message : 'unknown'
    });
    return json({ error: 'Unexpected server error.' }, 500, cors || {});
  } finally {
    if (Date.now() - startedAt > 5000) {
      console.log('slow-request', { path, method: request.method, ms: Date.now() - startedAt });
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};

export {
  validateCountry,
  parseGeminiResponse,
  normalizeAiResult,
  sanitizePhotosResponse,
  normalizePath,
  corsHeaders
};
