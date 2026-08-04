/**
 * Polish is the authoritative catalog: it defines the key space, and `./en.ts` is typed against
 * it so a key added here without an English counterpart is a type error.
 *
 * That contract is only enforced by `npm run check` (`astro check`), which CI runs — `astro build`
 * does not typecheck and type-aware ESLint reports lint rules, not compile errors. Do not drop
 * that CI step: an unpaired key renders the literal string "undefined", or throws in `t()` when
 * the message takes params.
 *
 * Flat, dotted keys — a nested object buys grouping and costs a lookup helper plus a recursive
 * key type for no benefit at this size.
 *
 * These catalogs must never be imported by a React island. Astro pages resolve the strings and
 * pass them down as props; an island that imports the catalog pulls both languages into the
 * client bundle, which is the same failure `src/lib/schemas/limits.ts` exists to prevent.
 */

export const pl = {
  "app.name": "Arrivo",

  "common.save": "Zapisz",
  "common.cancel": "Anuluj",
  "common.back": "Wróć",
  "common.soon": "Wkrótce",
  "common.loading": "Ładowanie…",

  "nav.dashboard": "Panel",
  "nav.discover": "Odkrywaj",
  "nav.profile": "Profil",
  "nav.services": "Usługi",
  "nav.signIn": "Zaloguj się",
  "nav.signUp": "Załóż konto",
  "nav.signOut": "Wyloguj się",
  "nav.signedOut": "Nie jesteś zalogowany",

  "language.label": "Język",
  "language.pl": "Polski",
  "language.en": "English",
  "language.switchTo": "Przełącz na {language}",

  "role.client": "Klient",
  "role.specialist": "Specjalista",
} as const;

export type MessageKey = keyof typeof pl;
