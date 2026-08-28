import type { MetadataRoute } from 'next';
import { locales, defaultLocale } from '@/i18n/locales';
import { SITE } from '@/lib/SITE';

const ROUTES = ['', '/about', '/privacy'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  for (const route of ROUTES) {
    // One entry per locale, with hreflang alternates + x-default
    for (const locale of locales) {
      const localePrefix = locale === defaultLocale ? '' : `/${locale}`;
      const url = `${SITE.url}${localePrefix}${route}/`;

      // Build the languages map for hreflang
      const languages: Record<string, string> = {};
      for (const l of locales) {
        const lp = l === defaultLocale ? '' : `/${l}`;
        languages[l] = `${SITE.url}${lp}${route}/`;
      }
      languages['x-default'] = `${SITE.url}${route}/`;

      entries.push({
        url,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: route === '' ? 1.0 : 0.6,
        alternates: { languages },
      });
    }
  }

  return entries;
}
