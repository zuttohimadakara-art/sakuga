import { getTranslations, setRequestLocale } from 'next-intl/server';
import { locales } from '@/i18n/locales';
import { SITE } from '@/lib/SITE';
import FrameExtractor from '@/components/FrameExtractor';
import JsonLd from '@/components/JsonLd';

export const dynamic = 'force-static';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tHero = await getTranslations('hero');
  const tFeature = await getTranslations('homeFeatures');
  const tFaq = await getTranslations('homeFaq');

  // Build the FAQ list from the message file (used for both UI and JSON-LD)
  const faqs = [
    { q: tFaq('0.q'), a: tFaq('0.a') },
    { q: tFaq('1.q'), a: tFaq('1.a') },
    { q: tFaq('2.q'), a: tFaq('2.a') },
    { q: tFaq('3.q'), a: tFaq('3.a') },
    { q: tFaq('4.q'), a: tFaq('4.a') },
  ];

  return (
    <>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebApplication',
              '@id': `${SITE.url}/#app`,
              name: 'getsakuga',
              url: SITE.url,
              applicationCategory: 'MultimediaApplication',
              operatingSystem: 'Any (browser)',
              browserRequirements: 'Requires a modern browser with JavaScript enabled',
              description: tHero('subtitle'),
              inLanguage: locale,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
              featureList: [
                tFeature('clientSide'),
                tFeature('range'),
                tFeature('scrub'),
                tFeature('fps'),
                tFeature('zip'),
                tFeature('free'),
              ],
              screenshot: `${SITE.url}/og-image.png`,
              author: { '@type': 'Organization', name: 'getsakuga', url: SITE.url },
            },
            {
              '@type': 'FAQPage',
              '@id': `${SITE.url}/#faq`,
              mainEntity: faqs.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
            {
              '@type': 'Organization',
              '@id': `${SITE.url}/#org`,
              name: 'getsakuga',
              url: SITE.url,
              logo: `${SITE.url}/favicon.svg`,
              sameAs: [
                // Add social profiles when the user has them.
              ],
            },
          ],
        }}
      />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-6 sm:pt-16 sm:pb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/30 rounded-full text-xs text-accent font-medium mb-5">
          <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          {tHero('badge')}
        </div>
        <h1 className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl text-fg tracking-tight leading-[1.05] max-w-3xl mx-auto">
          {tHero('title')}
        </h1>
        <p className="mt-5 text-lg text-fg-muted leading-relaxed max-w-2xl mx-auto">
          {tHero('subtitle')}
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <FrameExtractor />
      </section>

      {/* Features section for SEO content + h2s */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12 border-t border-border">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-fg mb-6 text-center">
          {tFeature('title')}
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: 'clientSide', icon: '🔒' },
            { key: 'range', icon: '✂️' },
            { key: 'scrub', icon: '⏯' },
            { key: 'fps', icon: '⚡' },
            { key: 'zip', icon: '📦' },
            { key: 'free', icon: '✨' },
          ].map(({ key, icon }) => (
            <div key={key} className="bg-bg-raised border border-border rounded-lg p-4">
              <div className="text-2xl mb-2" aria-hidden="true">{icon}</div>
              <h3 className="font-display font-semibold text-fg mb-1">
                {tFeature(`${key}Title`)}
              </h3>
              <p className="text-sm text-fg-muted leading-relaxed">
                {tFeature(key)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ section for SEO + AI citation surface */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-12 border-t border-border">
        <h2 className="font-display font-bold text-2xl sm:text-3xl text-fg mb-6">
          {tFaq('title')}
        </h2>
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <details key={i} className="group border border-border rounded-lg bg-bg-raised open:bg-bg-raised/80 transition">
              <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between font-medium text-fg">
                <span>{f.q}</span>
                <span className="text-fg-muted group-open:rotate-45 transition-transform text-xl" aria-hidden="true">+</span>
              </summary>
              <p className="px-4 pb-4 text-fg-muted leading-relaxed text-sm">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
