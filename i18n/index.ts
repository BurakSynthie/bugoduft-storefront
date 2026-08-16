import type { Locale } from './config';
import de from './dictionaries/de';
import en from './dictionaries/en';
import fr from './dictionaries/fr';
const dicts = { de, en, fr } as const;
export type Dict = typeof de;
export function getDict(locale: Locale): Dict { return dicts[locale]; }
