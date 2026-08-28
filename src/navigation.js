import { createNavigation } from 'next-intl/navigation';
import { locales, defaultLocale } from './i18n/locales';

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation({ locales, defaultLocale, localePrefix: 'as-needed' });
