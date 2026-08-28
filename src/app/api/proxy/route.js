// Server-side proxy for fetching video URLs.
// Sakugabooru and most video-hosting sites block CORS, so we can't fetch
// them directly from the browser. This API route fetches the URL server-side
// and streams the bytes back to the client with permissive CORS headers.
//
// Endpoints:
//   GET  /api/proxy?url=<encoded-url>
//   POST /api/proxy  with JSON body { url: "..." }
//
// For sakugabooru post URLs (sakugabooru.com/post/show/<id>), the route
// scrapes the page to find the actual MP4 URL, then fetches that.
//
// Safety:
//   - Only http/https URLs allowed
//   - Private IP ranges (127.0.0.1, 10.x, 192.168.x, etc.) blocked
//   - 10s timeout
//   - 100 MB max response size
//
// Privacy: the user's URL is forwarded but no request bodies or content
// are logged. The fetched bytes are streamed through and discarded.

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SAKUGA_POST = /^https?:\/\/(?:www\.)?sakugabooru\.com\/post\/show\/\d+/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv|avi)(\?|#|$)/i;
const KNOWN_VIDEO_HOST = /(?:^|\.)(?:cdn\.|files\.|media\.|v\.)\w+\./i
  || /akamaized\.net|cloudfront\.net|googlevideo\.com|b-cdn\.net/i;

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB safety cap
const TIMEOUT_MS = 10_000;

function isPrivateHost(hostname) {
  if (!hostname) return true;
  // localhost, 127.x, ::1
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true; // link-local
  if (/^0\./.test(hostname)) return true; // 0.0.0.0/8
  if (/^fc[0-9a-f]{2}:/i.test(hostname)) return true; // ULA
  if (/^fe80:/i.test(hostname)) return true;
  return false;
}

function badRequest(message, details) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  );
}

// Real browser User-Agent — Cloudflare and most anti-bot systems
// reject requests that look like a bot. The UA must be paired with
// other browser-like headers (Accept, Accept-Language, etc.) below
// to pass basic bot detection.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,video/*;q=0.8,*/*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

async function fetchWithTimeout(url, opts = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function isLikelyVideoUrl(url) {
  return VIDEO_EXT.test(url) || KNOWN_VIDEO_HOST.test(url);
}

async function scrapeSakugabooruPage(postUrl) {
  // Returns the direct MP4 URL found in the post page HTML, or null.
  const res = await fetchWithTimeout(postUrl, {
    headers: { ...BROWSER_HEADERS, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
  });
  if (!res.ok) {
    throw new Error(`sakugabooru returned ${res.status}`);
  }
  const html = await res.text();
  const patterns = [
    /<a[^>]+(?:class="original-file-rename"|id="highres")[^>]+href="([^"]+\.(?:mp4|webm|m4v)[^"]*)"/i,
    /<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i,
    /<meta[^>]+property="og:video:url"[^>]+content="([^"]+)"/i,
    /<meta[^>]+name="twitter:player:stream"[^>]+content="([^"]+)"/i,
    /<video[^>]+src="([^"]+\.(?:mp4|webm)[^"]*)"/i,
    /<source[^>]+src="([^"]+\.(?:mp4|webm)[^"]*)"/i,
    /"file_url"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|webm|m4v)[^"]*)"/i,
    /href="(https?:\/\/[^"]+\.(?:mp4|webm|m4v)[^"]*)"/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      try {
        return new URL(m[1], postUrl).toString();
      } catch {
        // ignore invalid URLs
      }
    }
  }
  return null;
}

function jsonError(message, code, status) {
  return NextResponse.json(
    { error: message, code },
    {
      status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  );
}

async function fetchAndStream(targetUrl, request) {
  const upstream = await fetchWithTimeout(targetUrl, {
    headers: {
      ...BROWSER_HEADERS,
      'Accept': request.headers.get('accept') || '*/*',
    },
  });
  if (!upstream.ok) {
    return jsonError(`Upstream returned HTTP ${upstream.status}`, 'upstream', 502);
  }
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
  const contentLengthHeader = upstream.headers.get('content-length');
  const declaredLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
  if (declaredLength && declaredLength > MAX_BYTES) {
    return jsonError(`Remote file is too large (${declaredLength} bytes). Max ${MAX_BYTES}.`, 'too_large', 413);
  }

  // Stream the body so large files don't hit response-size limits
  // Node's fetch() returns a WHATWG ReadableStream we can pass straight through.
  const stream = upstream.body;
  if (!stream) {
    return jsonError('Upstream returned no body', 'empty', 502);
  }

  // Wrap the stream to enforce a max-bytes cap as we read
  let bytesSent = 0;
  const limitedStream = new ReadableStream({
    async pull(controller) {
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { controller.close(); return; }
          bytesSent += value.byteLength;
          if (bytesSent > MAX_BYTES) {
            controller.error(new Error(`Exceeded max size ${MAX_BYTES} bytes`));
            await reader.cancel();
            return;
          }
          controller.enqueue(value);
        }
      } finally {
        try { reader.releaseLock(); } catch {}
      }
    },
    cancel(reason) {
      try { stream.cancel(reason); } catch {}
    },
  });

  return new Response(limitedStream, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Don't pass upstream's content-length; we may have wrapped it
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cache-Control': 'private, max-age=60',
      'X-Proxied-From': new URL(targetUrl).hostname,
    },
  });
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handle(request) {
  // Extract target URL from query (GET) or body (POST)
  let rawUrl = null;
  if (request.method === 'GET') {
    rawUrl = new URL(request.url).searchParams.get('url');
  } else {
    try {
      const body = await request.json();
      rawUrl = body?.url;
    } catch {
      return badRequest('POST body must be JSON with a "url" field.');
    }
  }
  if (!rawUrl) return badRequest('Missing "url" parameter.');

  let parsed;
  try { parsed = new URL(rawUrl); } catch { return badRequest('Invalid URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return badRequest('Only http(s) URLs are allowed.');
  if (isPrivateHost(parsed.hostname)) return badRequest('Refusing to fetch from a private/internal host.');

  // If it's a sakugabooru post, scrape first to find the MP4
  let target = rawUrl;
  if (SAKUGA_POST.test(rawUrl)) {
    try {
      const mp4 = await scrapeSakugabooruPage(rawUrl);
      if (!mp4) {
        return jsonError('Could not find a video on that sakugabooru post.', 'parse', 404);
      }
      const mp4Parsed = new URL(mp4);
      if (isPrivateHost(mp4Parsed.hostname)) {
        return jsonError('Resolved MP4 URL points to a private host.', 'parse', 400);
      }
      target = mp4;
    } catch (e) {
      return jsonError(`Sakugabooru scrape failed: ${e.message || String(e)}`, 'upstream', 502);
    }
  }

  // For other URLs, verify they look like videos before proxying
  if (!isLikelyVideoUrl(target) && !SAKUGA_POST.test(rawUrl)) {
    // Try to scrape one more time as a generic video page
    try {
      const res = await fetchWithTimeout(target, {
        headers: { ...BROWSER_HEADERS, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (/video|octet-stream|mp4|webm|quicktime/i.test(ct) || VIDEO_EXT.test(target)) {
          // It's actually a video — fall through to streaming
        } else {
          // Try to find a video URL in the HTML
          const html = await res.text();
          const og = html.match(/<meta[^>]+property="og:video(?::url)?[^>]+content="([^"]+)"/i);
          if (og) {
            try { target = new URL(og[1], target).toString(); } catch {}
          } else {
            return jsonError('URL does not point to a video and no <video> URL was found in the page.', 'format', 415);
          }
        }
      } else {
        return jsonError(`Upstream returned HTTP ${res.status}`, 'upstream', 502);
      }
    } catch (e) {
      return jsonError(`Could not fetch URL: ${e.message || String(e)}`, 'network', 502);
    }
  }

  return fetchAndStream(target, request);
}
