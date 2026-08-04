import type { Locale } from ".";

/**
 * Resolve a dictionary row's display name for the active locale.
 *
 * Every dictionary table (cities, service_areas, service_categories, service_subtypes) carries
 * `name` — Polish, authoritative — and `name_en`, both NOT NULL by migration. This is the only
 * place that chooses between them: reading `row.name` directly at a call site is how half a
 * screen ends up in the wrong language.
 *
 * Dictionary names are NOT part of the message catalogs. They are data, changed by migration, and
 * putting them in `messages/*.ts` would mean a new district needed a migration and a code change
 * that could silently disagree with each other.
 */
export interface LocalizedRow {
  name: string;
  name_en: string;
}

export function localizedName(row: LocalizedRow, locale: Locale): string {
  return locale === "en" ? row.name_en : row.name;
}

/**
 * Sort a list of dictionary rows the way the picker should present them. Kept next to
 * `localizedName` because the two are always used together and sorting by the *localized* string
 * is the subtle part: sorting by `name` while displaying `name_en` produces a list that looks
 * shuffled to an English reader.
 *
 * `Intl.Collator` with the locale is what makes "Łagiewniki" sort after "Krowodrza" in Polish
 * rather than after "Z" as a naive code-unit comparison would.
 */
export function byLocalizedName<T extends LocalizedRow>(locale: Locale): (a: T, b: T) => number {
  const collator = new Intl.Collator(locale);
  return (a, b) => collator.compare(localizedName(a, locale), localizedName(b, locale));
}
