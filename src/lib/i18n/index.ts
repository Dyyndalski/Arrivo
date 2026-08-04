/**
 * Locale resolution. Polish is the product's default — the launch market is Polish cities and the
 * service-area and taxonomy dictionaries are authored in Polish — with English as a peer.
 *
 * Deliberately no URL prefixes (`/pl/…`, `/en/…`). Every route, redirect and middleware path in
 * the app would have to change to carry a locale segment, including the auth flow that S-01
 * shipped and that has been verified end to end. The cost of that churn buys canonical per-locale
 * URLs, which matter for SEO on a marketing site and not much for an app behind a sign-in.
 */

export const LOCALES = ["pl", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pl";

/**
 * Not HttpOnly: the value carries no authority and nothing is protected by keeping it off the
 * document. Leaving it readable means a client-side switcher stays possible without a round trip.
 */
export const LOCALE_COOKIE = "arrivo_locale";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Parse an Accept-Language header into base tags ordered by descending q-value.
 *
 * Only the primary subtag is compared, so `pl-PL` matches `pl`. A malformed or missing q is
 * treated as 1, which is what the grammar in RFC 9110 §12.5.4 specifies.
 */
function preferredLanguages(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/i.exec(p)).find((m) => m !== null)?.[1];
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return {
        tag: tag.trim().toLowerCase().split("-")[0],
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

/**
 * An explicit choice always wins: a cookie set by the switcher is the user saying so, and a
 * browser sending `Accept-Language: en` must not silently override it on the next request.
 */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;

  if (acceptLanguage) {
    for (const tag of preferredLanguages(acceptLanguage)) {
      if (isLocale(tag)) return tag;
    }
  }

  return DEFAULT_LOCALE;
}
