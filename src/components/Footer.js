import { getTranslations } from 'next-intl/server';
import { Link } from '@/navigation';

export default async function Footer() {
  const t = await getTranslations('footer');
  return (
    <footer className="border-t border-white/5 mt-16 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-fg-subtle">
        <p>{t('tagline')}</p>
        <nav className="flex items-center gap-4">
          <Link href="/about" className="hover:text-fg-muted transition">{t('aboutLink')}</Link>
          <Link href="/privacy" className="hover:text-fg-muted transition">{t('privacyLink')}</Link>
        </nav>
      </div>
    </footer>
  );
}
