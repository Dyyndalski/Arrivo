import type { Locale } from ".";
import { en } from "./messages/en";
import { pl } from "./messages/pl";
import type { MessageKey } from "./messages/pl";

export type { MessageKey };

const CATALOGS: Record<Locale, Record<MessageKey, string>> = { pl, en };

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * Look up a message and interpolate `{placeholder}` params.
 *
 * No fallback, on purpose: the key type plus the parity check on `en` make a miss impossible
 * here, and a `?? key` guard would be unreachable code that reads as if it protected something.
 * For keys that are not known at compile time, use `tUnknown` below.
 */
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  return interpolate(CATALOGS[locale][key], params);
}

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(pl, key);
}

/**
 * Translate a key that arrived from untrusted input — the `?error=` query parameter the API
 * endpoints redirect with, which can just as easily come from a stale bookmark or a hand-edited
 * URL as from our own code.
 *
 * An unrecognised key resolves to `fallback` rather than being echoed. Astro escapes
 * interpolated values, so echoing would not be an injection, but it would put attacker-chosen
 * text on our page in the position where our own error messages appear.
 */
export function tUnknown(
  locale: Locale,
  key: string | null | undefined,
  fallback: MessageKey,
  params?: Record<string, string | number>,
): string {
  return key !== null && key !== undefined && isMessageKey(key) ? t(locale, key, params) : t(locale, fallback, params);
}

/** Bind the locale once at the top of a page instead of threading it through every call. */
export function useTranslations(locale: Locale) {
  return (key: MessageKey, params?: Record<string, string | number>): string => t(locale, key, params);
}
