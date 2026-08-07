/**
 * Money is stored as integer grosze and rendered with a comma, which is how Polish prices are
 * written. Extracted from ServiceList so the discovery cards and the public profile format the
 * same amount the same way — three copies of a `toLocaleString` call is how "120,00 zł" and
 * "120.00 zł" end up on the same screen.
 *
 * Deliberately not locale-switched: the currency is PLN in v1 either way, and an English-locale
 * "120.00 zł" would be a Polish price written in a foreign format.
 */
export function formatPrice(cents: number): string {
  return `${(cents / 100).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}
