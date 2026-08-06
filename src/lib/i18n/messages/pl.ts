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
 *
 * Dictionary values (districts, service categories) are NOT here — they live in the database with
 * a `name_en` column and are resolved by `src/lib/i18n/dictionary.ts`.
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

  // --- Auth screens ---------------------------------------------------------------------

  "auth.signIn.title": "Miło Cię widzieć",
  "auth.signIn.subtitle": "Zaloguj się do swojego konta",
  "auth.signIn.submit": "Zaloguj się",
  "auth.signIn.pending": "Logowanie…",

  "auth.signUp.title": "Załóż konto",
  "auth.signUp.subtitle": "Najpierw powiedz nam, kim jesteś",
  "auth.signUp.submit": "Utwórz konto",
  "auth.signUp.pending": "Tworzenie konta…",

  "auth.forgot.title": "Nie pamiętasz hasła?",
  "auth.forgot.subtitle": "Wyślemy Ci link do ustawienia nowego",
  "auth.forgot.submit": "Wyślij link",
  "auth.forgot.pending": "Wysyłanie…",

  "auth.forgotSent.title": "Sprawdź skrzynkę",
  "auth.forgotSent.body":
    "Jeśli istnieje konto na ten adres, wysłaliśmy na nie link do ustawienia nowego hasła. Link jest ważny przez godzinę.",

  "auth.reset.title": "Ustaw nowe hasło",
  "auth.reset.subtitle": "Po zapisaniu zalogujesz się nowym hasłem",
  "auth.reset.submit": "Zapisz hasło",
  "auth.reset.pending": "Zapisywanie…",

  "auth.confirmEmail.title": "Potwierdź adres e-mail",
  "auth.confirmEmail.body":
    "Wysłaliśmy wiadomość z linkiem potwierdzającym. Kliknij go, żeby dokończyć zakładanie konta.",
  // The local stack auto-confirms, so in dev there is no email to wait for.
  "auth.confirmEmail.devTitle": "Konto utworzone",
  "auth.confirmEmail.devBody": "Możesz się już zalogować.",

  "auth.field.email": "Adres e-mail",
  "auth.field.emailPlaceholder": "ty@przyklad.pl",
  "auth.field.password": "Hasło",
  "auth.field.passwordPlaceholder": "••••••••",
  "auth.field.newPassword": "Nowe hasło",
  "auth.field.newPasswordPlaceholder": "Min. {min} znaków",
  "auth.field.confirmPassword": "Powtórz hasło",
  "auth.field.confirmPasswordPlaceholder": "Wpisz hasło ponownie",
  // Static, not a live countdown. "Brakuje jeszcze 2 znaków / 1 znaku / 5 znaków" needs three
  // Polish plural forms; the phrasing below sidesteps that without losing the guidance.
  "auth.field.passwordHint": "Minimum {min} znaków",
  "auth.field.showPassword": "Pokaż hasło",
  "auth.field.hidePassword": "Ukryj hasło",

  "auth.link.forgot": "Nie pamiętasz hasła?",
  "auth.link.noAccount": "Nie masz jeszcze konta?",
  "auth.link.haveAccount": "Masz już konto?",
  "auth.link.backToSignIn": "Wróć do logowania",

  "auth.role.legend": "Kim jesteś?",
  "auth.role.client.title": "Jestem klientem",
  "auth.role.client.description": "Szukam specjalisty, który przyjedzie do mnie",
  "auth.role.specialist.title": "Jestem specjalistą",
  "auth.role.specialist.description": "Oferuję usługi z dojazdem do klienta",

  // Error keys. Everything the server can put in `?error=` resolves through these; an
  // unrecognised value falls back to `auth.error.generic` rather than being echoed onto the page.
  "auth.error.generic": "Coś poszło nie tak — spróbuj ponownie",
  "auth.error.notConfigured": "Logowanie jest chwilowo niedostępne — spróbuj później",
  "auth.error.emailInvalid": "Podaj poprawny adres e-mail",
  "auth.error.passwordRequired": "Podaj hasło",
  "auth.error.passwordTooShort": "Hasło musi mieć co najmniej {min} znaków",
  "auth.error.roleRequired": "Wybierz, czy jesteś klientem, czy specjalistą",
  "auth.error.confirmRequired": "Powtórz hasło",
  "auth.error.passwordsMismatch": "Hasła nie są takie same",
  "auth.error.invalidCredentials": "Nieprawidłowy e-mail lub hasło",
  "auth.error.emailNotConfirmed": "Potwierdź najpierw adres e-mail — sprawdź skrzynkę",
  "auth.error.rateLimited": "Zbyt wiele prób — odczekaj chwilę i spróbuj ponownie",
  "auth.error.weakPassword": "To hasło jest zbyt słabe — wybierz inne",
  "auth.error.samePassword": "Nowe hasło musi różnić się od poprzedniego",
  "auth.error.linkExpired": "Link wygasł lub jest nieprawidłowy — poproś o nowy",
  "auth.error.sessionExpired": "Twoja sesja wygasła — zaloguj się ponownie",

  "auth.message.alreadyRegistered": "Ten adres jest już zarejestrowany — zaloguj się",
  "auth.message.passwordUpdated": "Hasło zmienione — zaloguj się",

  // --- Dashboard ------------------------------------------------------------------------

  "dashboard.title": "Panel",
  "dashboard.greeting": "Witaj ponownie",
  "dashboard.specialist.profile.title": "Twój profil",
  "dashboard.specialist.profile.description": "Nazwa i dzielnice, do których dojeżdżasz",
  "dashboard.specialist.services.title": "Twoje usługi",
  "dashboard.specialist.services.description": "Co oferujesz i w jakiej cenie",
  "dashboard.client.discover.title": "Znajdź specjalistę",
  "dashboard.client.discover.description": "Przeglądaj specjalistów, którzy dojeżdżają w Twoją okolicę",
  "dashboard.client.profile.title": "Twój profil",
  "dashboard.client.profile.description": "Adres i dane kontaktowe",
} as const;

export type MessageKey = keyof typeof pl;
