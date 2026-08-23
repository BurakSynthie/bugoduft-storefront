import 'server-only';

import type { Locale } from '@/i18n/config';
import { locales } from '@/i18n/config';
import { itemPath } from '@/lib/routing';
import { getSettings } from '@/repositories/settings';
import * as seed from '@/repositories/catalog';

export type IndustryView = {
  key: string;
  groupId: string;
  name: string;
  slug: string;
  headline: string;
  body: string;
  seo: { title: string; description: string };
  ogImage: string | null;
};

function fixedSettingsKey(key: string): 'autohaus' | 'werkstatt' | null {
  if (key === 'autohaeuser') return 'autohaus';
  if (key === 'werkstaetten') return 'werkstatt';
  return null;
}

export async function getIndustries(locale: Locale): Promise<IndustryView[]> {
  const settings = await getSettings();

  const builtIn: IndustryView[] = seed.listIndustries(locale).map((i) => {
    const fixed = fixedSettingsKey(i.key);
    const visible = fixed ? settings.industryContent[fixed] : null;
    const seoPage = fixed ? settings.seo.pages[fixed] : null;

    return {
      key: i.key,
      groupId: i.groupId,
      name: i.name,
      slug: i.slug,
      headline: visible?.h1[locale] || i.headline,
      body: visible?.body[locale] || i.body,
      seo: {
        title: seoPage?.title[locale] || i.seo.title,
        description: seoPage?.description[locale] || i.seo.description,
      },
      ogImage: seoPage?.ogImage || null,
    };
  });

  const custom: IndustryView[] = settings.customIndustries
    .filter((i) => i.active)
    .map((i) => ({
      key: `custom:${i.id}`,
      groupId: `custom:${i.id}`,
      name: i.name[locale],
      slug: i.slug[locale],
      headline: i.h1[locale],
      body: i.body[locale],
      seo: {
        title: i.seoTitle[locale] || i.h1[locale],
        description: i.seoDescription[locale] || i.body[locale].slice(0, 160),
      },
      ogImage: i.ogImage,
    }));

  return [...builtIn, ...custom];
}

export async function getIndustryBySlug(
  locale: Locale,
  slug: string,
): Promise<IndustryView | null> {
  const all = await getIndustries(locale);
  return all.find((i) => i.slug === slug) ?? null;
}

export async function getIndustryAlternates(
  groupId: string,
): Promise<Record<Locale, string>> {
  if (!groupId.startsWith('custom:')) {
    return seed.industryAlternates(groupId);
  }

  const id = groupId.slice('custom:'.length);
  const settings = await getSettings();
  const item = settings.customIndustries.find((i) => i.id === id && i.active);

  if (!item) {
    return Object.fromEntries(
      locales.map((l) => [l, itemPath('industries', l, '')]),
    ) as Record<Locale, string>;
  }

  return Object.fromEntries(
    locales.map((l) => [l, itemPath('industries', l, item.slug[l])]),
  ) as Record<Locale, string>;
}
