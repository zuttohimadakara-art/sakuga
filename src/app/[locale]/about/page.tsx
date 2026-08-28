import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';

export const dynamic = 'force-static';

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('about');

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="font-display font-bold text-3xl sm:text-4xl text-fg mb-6">{t('title')}</h1>
      <p className="text-fg-muted text-lg leading-relaxed mb-10">{t('body')}</p>

      <ul className="space-y-3">
        {['clientSide', 'sakugabooru', 'scrub', 'zip', 'free'].map((k) => (
          <li key={k} className="flex items-start gap-3 bg-bg-raised border border-border rounded-lg px-4 py-3">
            <span className="text-accent text-xl leading-none mt-0.5">✓</span>
            <span className="text-fg-muted leading-relaxed">{t(`features.${k}`)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-12 text-sm text-fg-subtle">
        <Link href="/" className="text-accent hover:text-accent-hover underline">← {t('title')}</Link>
      </div>
    </div>
  );
}
