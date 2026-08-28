// urlFetcher.js — fetch a video from a user-provided URL.
//
// Goes through our own /api/proxy so we can fetch sites that block CORS
// (sakugabooru, twitter, imgur, etc.). The proxy streams the bytes back
// with permissive CORS headers, so the browser just sees a normal fetch.
//
// Two flows:
//   1. Direct MP4/WebM/etc. URL → proxy fetches and returns the bytes
//   2. Sakugabooru post URL (https://www.sakugabooru.com/post/show/123456)
//      → proxy scrapes the page, finds the MP4, then streams it
//
// The proxy also handles generic pages that have an og:video meta tag.

const SAKUGA_POST = /^https?:\/\/(?:www\.)?sakugabooru\.com\/post\/show\/\d+/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv|avi)(\?|#|$)/i;
const KNOWN_VIDEO_HOST = /(?:^|\.)(?:cdn\.|files\.|media\.|v\.)\w+\./i
  || /akamaized\.net|cloudfront\.net|googlevideo\.com|b-cdn\.net/i;

export class FetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Try to fetch a video from a URL via our server-side proxy.
 * Returns { blob, sourceUrl, contentType, proxiedFrom }.
 * Throws FetchError with code ∈ { cors, notFound, format, network, parse, tooLarge }.
 */
export async function fetchVideoFromUrl(inputUrl) {
  const url = normalizeUrl(inputUrl);
  if (!url) throw new FetchError('format', 'Invalid URL.');

  // If it's clearly a video URL or known video host, just proxy it.
  // Otherwise the proxy will try to scrape the page for a video URL.
  const result = await proxyFetch(url);

  if (!result.ok) {
    // Map proxy error codes to FetchError codes
    const errBody = result.body;
    const code = errBody?.code || 'network';
    const msg = errBody?.error || `Proxy returned ${result.status}.`;
    throw new FetchError(code, msg);
  }

  const blob = result.blob;
  if (blob.size === 0) throw new FetchError('network', 'Proxy returned an empty response.');
  if (blob.size > 100 * 1024 * 1024) {
    throw new FetchError('tooLarge', 'File is over 100 MB. Trim the clip or upload it directly.');
  }
  return {
    blob,
    sourceUrl: url,
    contentType: result.contentType,
    proxiedFrom: result.proxiedFrom,
  };
}

function normalizeUrl(input) {
  try {
    const u = new URL(input.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function proxyFetch(url) {
  // Try our own Vercel proxy first. If it fails for any reason, fall back
  // to a third-party CORS proxy (corsproxy.io) which has no size limit
  // but routes the request through a third party. The fallback is only
  // used as a last resort.
  const primary = await fetchViaProxy(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (primary.ok) return primary;

  // Don't fall back if the error is clearly a "this URL isn't a video"
  // — that won't be fixed by a different proxy.
  if (primary.body?.code === 'format' || primary.body?.code === 'parse' || primary.body?.code === 'too_large') {
    return primary;
  }
  // Don't fall back on 4xx (client error) — those are deterministic
  if (primary.status >= 400 && primary.status < 500) return primary;

  // Try the public corsproxy.io fallback
  try {
    const fallback = await fetchViaProxy(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
    if (fallback.ok) return fallback;
  } catch {
    // ignore — fall through
  }
  return primary;
}

async function fetchViaProxy(proxyUrl) {
  let response;
  try {
    response = await fetch(proxyUrl, {
      method: 'GET',
      headers: { 'Accept': 'video/*,*/*' },
    });
  } catch (e) {
    return { ok: false, status: 0, body: { error: e.message || 'Network error', code: 'network' } };
  }
  const contentType = response.headers.get('content-type') || '';
  const proxiedFrom = response.headers.get('x-proxied-from') || '';
  if (response.ok) {
    const blob = await response.blob();
    return { ok: true, status: response.status, blob, contentType, proxiedFrom };
  }
  let body = null;
  try { body = await response.json(); } catch { /* not JSON */ }
  return { ok: false, status: response.status, body };
}
