import { getTranslations } from 'next-intl/server';
import { Link } from '@/navigation';
import LocaleSwitcher from './LocaleSwitcher';
import { SITE } from '@/lib/SITE';

export default async function Header() {
  const t = await getTranslations('header');
  return (
    <header className="border-b border-white/5 bg-bg/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-display font-bold text-lg tracking-tight text-fg hover:text-accent transition flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="text-accent">
            {/* film-strip corner mark */}
            <rect x="2" y="2" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <rect x="5" y="5" width="3" height="3" fill="currentColor" />
            <rect x="14" y="5" width="3" height="3" fill="currentColor" />
            <rect x="5" y="14" width="3" height="3" fill="currentColor" />
            <rect x="14" y="14" width="3" height="3" fill="currentColor" />
          </svg>
          <span>{SITE.name}</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-5 text-sm text-fg-muted">
          <Link href="/" className="hover:text-fg transition">{t('nav.home')}</Link>
          <Link href="/about" className="hover:text-fg transition">{t('nav.about')}</Link>
          <Link href="/contact" className="hover:text-fg transition">{t('nav.contact')}</Link>
        </nav>
        <LocaleSwitcher />
      </div>
    </header>
  );
}
