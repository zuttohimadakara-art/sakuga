import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.js');

const nextConfig: NextConfig = {
  // Normalize URLs: add trailing slash. Vercel handles www/apex redirects.
  trailingSlash: true,
  // Make AdSense and Googlebot happy: do NOT block AI crawlers.
  // We want to be discoverable in AI search (Perplexity, ChatGPT, Copilot).
  experimental: {
    // anything experimental we need
  },
  // Disable Next.js image optimization for favicons (we serve raw PNGs/SVGs)
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
