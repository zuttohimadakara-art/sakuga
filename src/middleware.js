import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n/locales';

export default createMiddleware({
  locales,
  defaultLocale,
  // Default (en) renders at the root URL, others get prefixed
  // e.g. /about vs /ja/about
  localePrefix: 'as-needed',
});

export const config = {
  // Skip API routes, Next.js internals, Vercel internals, and files
  matcher: ['/((?!api|_next|_vercel|ads\\.txt|.*\\..*).*)'],
};
