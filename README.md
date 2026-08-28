# getsakuga

**A frame-by-frame video extractor for animators.** 100% in-browser — your clips never leave your device.

🌐 Live (when deployed): **https://getsakuga.com**

## What it does

- **Upload a video** (MP4/WebM/MOV/GIF) by drag-drop or file picker
- **OR paste a URL** — sakugabooru post links are auto-scraped for the MP4, direct MP4 URLs work too
- **Step through frame-by-frame** with arrow keys, or play/pause with space
- **Pick your target FPS** — 12 (TV anime), 24 (film), 30 (web), 60 (games), source rate, or any custom value
- **Choose a frame range** — whole video or just the in-betweens you care about
- **Configure output** — PNG or JPEG (with quality slider), full/½/¼ resolution
- **Download a ZIP** with sequential filenames (`frame_00001.png`, `frame_00002.png`, …) plus a `metadata.json` sidecar

## Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** with TypeScript
- **next-intl 4** for 5-locale i18n (en/ja/de/es/fr) with x-default hreflang
- **Tailwind 4** (dark-first theme)
- **JSZip** for client-side ZIP packing
- **HTML5 video + Canvas + requestVideoFrameCallback** for frame-accurate extraction
- **Vercel Web Analytics** for traffic (no cookie banner, privacy-friendly)
- **Google AdSense** for monetization (publisher `ca-pub-7628709998264706`)

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `zuttohimadakara-art/sakuga` repository
3. Framework: **Next.js** (auto-detected)
4. Build command: `next build` (default)
5. Output: `.next` (default)
6. **No env vars needed** — analytics + AdSense are hardcoded
7. Click **Deploy**

## Wiring the domain

In the Vercel project → **Settings → Domains**:

1. Add `getsakuga.com` (apex) — Vercel will show the recommended DNS records
2. Add `www.getsakuga.com` — Vercel will set up a 308 redirect from www → apex (or vice versa, your choice)

In your DNS provider (Porkbun / Cloudflare / etc.):

| Type | Host | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` (Vercel's IP — confirm in Vercel) |
| CNAME | `www` | `cname.vercel-dns.com` |

DNS propagates in minutes-to-hours. Vercel will auto-issue a Let's Encrypt cert.

## AdSense domain approval

Once deployed at getsakuga.com, file a new domain in AdSense with that URL. The `<meta name="google-adsense-account">` tag and `ads.txt` are already wired. Approval typically takes 1–7 days.

## i18n

Add or change a translation in any of:

- `src/messages/en.json` (English — master)
- `src/messages/ja.json` (Japanese)
- `src/messages/de.json` (German)
- `src/messages/es.json` (Spanish)
- `src/messages/fr.json` (French)

The default locale (en) renders at the root URL. Others are prefixed: `/ja/`, `/de/`, etc.

To add a 6th locale:
1. Add the code to `src/i18n/locales.js` (and the `localeBcp47`, `localeLabels`, `localeShort` maps)
2. Create `src/messages/<code>.json`
3. Add a `<link rel="alternate" hrefLang="<code>" ...>` in the layout
4. Add the locale to the `ROUTES` map in `src/app/sitemap.ts`

## Architecture

```
src/
├── app/
│   ├── [locale]/
│   │   ├── layout.tsx          ← locale provider, i18n, header, footer, AdSense, analytics
│   │   ├── page.tsx            ← home — hero + FrameExtractor
│   │   ├── about/page.tsx
│   │   ├── privacy/page.tsx
│   │   └── globals.css         ← dark theme tokens + Tailwind
│   ├── sitemap.ts              ← dynamic sitemap with hreflang + x-default
│   └── globals.css             ← (re-imported by [locale]/layout)
├── components/
│   ├── FrameExtractor.js       ← main tool: upload, player, controls, extract, download
│   ├── Header.js
│   ├── Footer.js
│   └── LocaleSwitcher.js
├── lib/
│   ├── extractFrames.js        ← canvas-based frame extraction + ZIP packing
│   ├── urlFetcher.js           ← sakugabooru + direct URL fetch with CORS error handling
│   └── SITE.js                 ← site-wide constants
├── i18n/
│   ├── locales.js              ← locale registry (5 locales + bcp47 + labels)
│   └── …
├── messages/
│   ├── en.json                 ← English master
│   ├── ja.json                 ← Japanese
│   ├── de.json                 ← German
│   ├── es.json                 ← Spanish
│   └── fr.json                 ← French
├── i18n.js                     ← next-intl getRequestConfig
├── middleware.js               ← next-intl locale routing
└── navigation.js               ← next-intl Link/redirect/router
```

## Keyboard shortcuts

When a video is loaded:

| Key | Action |
|-----|--------|
| `Space` | Play / pause |
| `←` / `→` | Previous / next frame |
| `Home` / `End` | Jump to start / end |

## Privacy

Everything runs in the browser. The video file, your frame selections, and the generated ZIP never leave your device. The only outbound network calls are:
- Google Fonts (typography)
- Google AdSense (ad script — only when an ad slot is rendered)
- Vercel Analytics (page-view events — no PII)

There is no upload server, no telemetry on video content, and no third-party video processing.

## License

Personal tool — license to be determined by the owner.
