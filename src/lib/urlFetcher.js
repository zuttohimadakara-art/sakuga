// urlFetcher.js — fetch a video from a user-provided URL.
//
// Two flows:
//   1. Direct MP4/WebM/etc. URL → just fetch the bytes
//   2. Sakugabooru post URL (https://www.sakugabooru.com/post/show/123456)
//      → scrape the HTML to find the actual MP4 URL, then fetch that
//
// Both return a Blob with the video bytes. The caller (FrameExtractor) wraps
// it in an ObjectURL for the <video> element.
//
// Error handling: many sites block cross-origin fetches. We surface a clear
// error so the user knows to download the file and drop it in instead.

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv|avi)(\?|#|$)/i;

export class FetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Try to fetch a video from a URL. Returns { blob, sourceUrl, contentType }.
 * Throws FetchError with code ∈ { cors, notFound, format, network, parse }.
 */
export async function fetchVideoFromUrl(inputUrl) {
  const url = normalizeUrl(inputUrl);
  if (!url) throw new FetchError('format', 'Invalid URL.');

  // Case 1: looks like a direct video URL → try fetching it directly.
  if (VIDEO_EXT.test(url) || isKnownVideoHost(url)) {
    return await fetchDirectVideo(url);
  }

  // Case 2: looks like a page (sakugabooru, twitter, etc.) → scrape then fetch.
  const videoUrl = await scrapePageForVideoUrl(url);
  if (!videoUrl) {
    throw new FetchError('parse', 'Could not find a video on that page.');
  }
  return await fetchDirectVideo(videoUrl);
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

function isKnownVideoHost(url) {
  // Hosts where URLs typically point directly to video files
  return /(^|\.)(cdn\.|files\.|media\.|v\.)\w+\./i.test(url)
    || /akamaized\.net|cloudfront\.net|googlevideo\.com|b-cdn\.net/i.test(url);
}

async function fetchDirectVideo(url) {
  let response;
  try {
    response = await fetch(url, { mode: 'cors', redirect: 'follow' });
  } catch (e) {
    // Most common: CORS block (the response was opaque or preflight failed)
    throw new FetchError(
      'cors',
      'Cross-origin block. The site does not allow direct loading from another domain. Save the file and upload it instead.'
    );
  }
  if (response.status === 404) throw new FetchError('notFound', 'Video not found (HTTP 404).');
  if (!response.ok) throw new FetchError('network', `Server returned ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  if (!/video|octet-stream|mp4|webm|quicktime/i.test(contentType) && !VIDEO_EXT.test(url)) {
    throw new FetchError('format', `URL does not point to a video (content-type: ${contentType || 'unknown'}).`);
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new FetchError('network', 'Server returned an empty response.');
  return { blob, sourceUrl: url, contentType };
}

/**
 * Try to find a video URL inside a page's HTML.
 * Currently handles: sakugabooru.
 * Returns the video URL, or null.
 */
async function scrapePageForVideoUrl(pageUrl) {
  if (/sakugabooru\.com\/post\/show\//i.test(pageUrl)) {
    return await scrapeSakugabooru(pageUrl);
  }
  // Generic fallback: try a few common patterns. Most sites won't work without
  // a server-side proxy, but we try anyway.
  return await scrapeGenericPage(pageUrl);
}

async function scrapeSakugabooru(pageUrl) {
  let response;
  try {
    response = await fetch(pageUrl, { mode: 'cors', credentials: 'omit' });
  } catch {
    throw new FetchError(
      'cors',
      'Could not reach sakugabooru (cross-origin block). Download the MP4 and upload it instead.'
    );
  }
  if (!response.ok) throw new FetchError('notFound', `sakugabooru returned ${response.status}.`);
  const html = await response.text();

  // Sakugabooru uses <a> tags with class "original-file-rename" or similar pointing
  // to the MP4. Common selectors (any of these should hit):
  //  - <a class="original-file-rename" href="https://.../file.mp4">
  //  - <a id="highres" href="...">
  //  - og:video meta tag
  //  - <video src="...">
  const patterns = [
    /<a[^>]+(?:class="original-file-rename"|id="highres")[^>]+href="([^"]+\.(?:mp4|webm|m4v)[^"]*)"/i,
    /<meta[^>]+property="og:video"[^>]+content="([^"]+)"/i,
    /<video[^>]+src="([^"]+\.(?:mp4|webm)[^"]*)"/i,
    /"file_url":"(https?:\/\/[^"]+\.(?:mp4|webm|m4v)[^"]*)"/i,
    /href="(https?:\/\/[^"]+\.(?:mp4|webm|m4v)[^"]*)"/i, // last resort
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return new URL(m[1], pageUrl).toString();
  }
  return null;
}

async function scrapeGenericPage(pageUrl) {
  // Very few sites allow CORS reads of their HTML. Try anyway with a HEAD first.
  let response;
  try {
    response = await fetch(pageUrl, { mode: 'cors', credentials: 'omit' });
  } catch {
    throw new FetchError(
      'cors',
      'Cross-origin block. The site does not allow direct loading from another domain. Save the file and upload it instead.'
    );
  }
  if (!response.ok) throw new FetchError('notFound', `Page returned ${response.status}.`);
  const ct = response.headers.get('content-type') || '';
  if (!/html/i.test(ct)) {
    // Not HTML — maybe a direct video after all
    if (/video|octet-stream|mp4|webm/i.test(ct)) return pageUrl;
    throw new FetchError('format', 'URL does not point to an HTML page or video.');
  }
  const html = await response.text();
  const og = html.match(/<meta[^>]+property="og:video(?::url)?[^>]+content="([^"]+)"/i);
  if (og) return new URL(og[1], pageUrl).toString();
  const tw = html.match(/<meta[^>]+name="twitter:player:stream"[^>]+content="([^"]+)"/i);
  if (tw) return new URL(tw[1], pageUrl).toString();
  return null;
}
