import { getTranslations, setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n/locales';
import FrameExtractor from '@/components/FrameExtractor';

export const dynamic = 'force-static';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('hero');

  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-6 sm:pt-16 sm:pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/30 rounded-full text-xs text-accent font-medium mb-5">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          {t('badge')}
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-fg tracking-tight leading-[1.05] max-w-3xl mx-auto">
          {t('title')}
        </h1>
        <p className="mt-5 text-lg text-fg-muted leading-relaxed max-w-2xl mx-auto">
          {t('subtitle')}
        </p>
      </section>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <FrameExtractor />
      </section>
    </>
  );
}
