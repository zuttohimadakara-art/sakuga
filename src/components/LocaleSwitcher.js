'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/navigation';
import { useState, useRef, useEffect } from 'react';
import { locales, localeShort, localeLabels } from '@/i18n/locales';

export default function LocaleSwitcher() {
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const switchTo = (newLocale) => {
    // Preserve the current path; next-intl's router handles the locale prefix
    // (drops the prefix for the default locale, adds it for the others).
    router.replace(pathname, { locale: newLocale });
    // Persist user choice in a cookie so the next visit remembers
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000;samesite=lax`;
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-fg-muted hover:text-fg transition border border-white/10 hover:border-white/25 rounded"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{localeShort[currentLocale] || currentLocale.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-1 z-50 min-w-[10rem] py-1 bg-bg-raised border border-white/15 rounded shadow-lg"
        >
          {locales.map((l) => (
            <li key={l} role="option" aria-selected={l === currentLocale}>
              <button
                type="button"
                onClick={() => switchTo(l)}
                className={`w-full text-left px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition ${
                  l === currentLocale
                    ? 'text-accent bg-white/5'
                    : 'text-fg-muted hover:text-fg hover:bg-white/5'
                }`}
              >
                <span className="inline-block w-8">{localeShort[l]}</span>
                <span className="text-fg">{localeLabels[l]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
