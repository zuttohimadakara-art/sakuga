import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/navigation';
import { SITE } from '@/lib/SITE';
import JsonLd from '@/components/JsonLd';

export const dynamic = 'force-static';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['en','ja','de','es','fr'].includes(locale)) return {};
  const messages = (await import(`@/messages/${locale}.json`)).default;
  return {
    title: messages.contact?.meta?.title || 'Contact getsakuga',
    description: messages.contact?.meta?.description || 'Get in touch with the getsakuga team.',
    alternates: {
      canonical: locale === 'en' ? '/contact/' : `/${locale}/contact/`,
      languages: {
        en: '/contact/',
        ja: '/ja/contact/',
        de: '/de/contact/',
        es: '/es/contact/',
        fr: '/fr/contact/',
        'x-default': '/contact/',
      },
    },
  };
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('contact');

  return (
    <>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          '@id': `${SITE.url}/contact/#page`,
          url: `${SITE.url}/contact/`,
          name: t('meta.title'),
          inLanguage: locale,
          isPartOf: { '@id': `${SITE.url}/#website` },
          mainEntity: {
            '@type': 'Organization',
            '@id': `${SITE.url}/#org`,
            name: 'getsakuga',
            url: SITE.url,
            email: 'mailto:zuttohimadakara@gmail.com',
          },
        }}
      />

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-display font-bold text-3xl sm:text-4xl text-fg mb-4">{t('title')}</h1>
        <p className="text-fg-muted text-lg leading-relaxed mb-8">{t('intro')}</p>

        <div className="space-y-6">
          {/* Email */}
          <section className="bg-bg-raised border border-border rounded-lg p-5">
            <h2 className="font-display font-semibold text-fg text-xl mb-2">{t('emailTitle')}</h2>
            <p className="text-fg-muted text-sm leading-relaxed mb-3">
              {t('emailBody')}
            </p>
            <a
              href="mailto:zuttohimadakara@gmail.com"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-bg font-medium rounded hover:bg-accent-hover transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              zuttohimadakara@gmail.com
            </a>
          </section>

          {/* What to contact about */}
          <section>
            <h2 className="font-display font-semibold text-fg text-xl mb-3">{t('topicsTitle')}</h2>
            <ul className="space-y-2 text-fg-muted text-sm">
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                <span>{t('topics1')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                <span>{t('topics2')}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-accent">•</span>
                <span>{t('topics3')}</span>
              </li>
            </ul>
          </section>

          {/* Response time */}
          <section className="bg-bg-raised border border-border rounded-lg p-5">
            <h2 className="font-display font-semibold text-fg text-xl mb-2">{t('responseTitle')}</h2>
            <p className="text-fg-muted text-sm leading-relaxed">{t('responseBody')}</p>
          </section>
        </div>

        <div className="mt-12 text-sm text-fg-subtle">
          <Link href="/" className="text-accent hover:text-accent-hover underline">← {t('back')}</Link>
        </div>
      </div>
    </>
  );
}
