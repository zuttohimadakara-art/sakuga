import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { locales, localeBcp47 } from '@/i18n/locales';
import { SITE } from '@/lib/SITE';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import '../globals.css';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!locales.includes(locale)) return {};
  const messages = (await import(`@/messages/${locale}.json`)).default;
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: messages.meta?.title,
      template: `%s | ${SITE.name}`,
    },
    description: messages.meta?.description,
    keywords: messages.seo?.keywords
      ? messages.seo.keywords.split(',').map((k: string) => k.trim())
      : undefined,
    authors: [{ name: SITE.name, url: SITE.url }],
    creator: SITE.name,
    publisher: SITE.name,
    alternates: {
      canonical: locale === 'en' ? '/' : `/${locale}/`,
      languages: {
        en: '/',
        ja: '/ja/',
        de: '/de/',
        es: '/es/',
        fr: '/fr/',
        'x-default': '/',
      },
    },
    openGraph: {
      type: 'website',
      locale: (localeBcp47 as Record<string, string>)[locale] || 'en',
      url: SITE.url,
      siteName: SITE.name,
      title: messages.meta?.ogTitle || messages.meta?.title,
      description: messages.meta?.description,
      images: [{ url: SITE.ogImage, width: 1200, height: 630, alt: SITE.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: messages.meta?.ogTitle || messages.meta?.title,
      description: messages.meta?.description,
      creator: SITE.twitterHandle,
      site: SITE.twitterHandle,
      images: [SITE.ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
    },
    other: {
      'google-adsense-account': 'ca-pub-7628709998264706',
    },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!locales.includes(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={(localeBcp47 as Record<string, string>)[locale] || locale} className="dark">
      <head>
        <meta name="theme-color" content="#070a14" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col bg-bg text-fg antialiased">
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7628709998264706"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
