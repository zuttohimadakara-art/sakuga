import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';

export const dynamic = 'force-static';

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('privacy');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-fg mb-6">{t('title')}</h1>
      <p className="text-fg-muted text-lg leading-relaxed">{t('body')}</p>

      <div className="mt-12 text-sm text-fg-subtle">
        <Link href="/" className="text-accent hover:text-accent-hover underline">← {t('title')}</Link>
      </div>
    </div>
  );
}
