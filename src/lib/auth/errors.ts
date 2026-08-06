import type { MessageKey } from "@/lib/i18n/t";

/**
 * Map a Supabase auth failure onto a catalog key.
 *
 * The plan's phase 3 says endpoints must redirect with a stable key rather than an English
 * sentence. Our own validation messages already are keys — the zod schemas emit them. But roughly
 * half the failure paths surface `error.message` from Supabase, which is an arbitrary English
 * string chosen by a service we do not control and cannot translate at the point of display.
 * This is the missing piece: codes in, keys out.
 *
 * `code` is the stable contract (Supabase's `AuthApiError.code`); the message regexes below are a
 * fallback for older responses and for the local stack, which does not always populate `code`.
 * Anything unrecognised becomes `auth.error.generic` — never the raw message, because that would
 * put untranslated text on a Polish page and hand an attacker who can influence the upstream
 * error a way to choose copy in the position our own errors occupy.
 */

const BY_CODE: Record<string, MessageKey> = {
  invalid_credentials: "auth.error.invalidCredentials",
  email_not_confirmed: "auth.error.emailNotConfirmed",
  over_email_send_rate_limit: "auth.error.rateLimited",
  over_request_rate_limit: "auth.error.rateLimited",
  over_sms_send_rate_limit: "auth.error.rateLimited",
  weak_password: "auth.error.weakPassword",
  same_password: "auth.error.samePassword",
  user_already_exists: "auth.message.alreadyRegistered",
  email_exists: "auth.error.generic",
  otp_expired: "auth.error.linkExpired",
  session_not_found: "auth.error.sessionExpired",
  session_expired: "auth.error.sessionExpired",
};

const BY_MESSAGE: [RegExp, MessageKey][] = [
  [/invalid login credentials/i, "auth.error.invalidCredentials"],
  [/email not confirmed/i, "auth.error.emailNotConfirmed"],
  [/rate limit|too many requests/i, "auth.error.rateLimited"],
  [/password should be at least|weak password/i, "auth.error.weakPassword"],
  [/should be different from the old password/i, "auth.error.samePassword"],
  [/expired|invalid.*token/i, "auth.error.linkExpired"],
];

export function authErrorKey(error: { code?: string; message?: string } | null | undefined): MessageKey {
  if (!error) return "auth.error.generic";

  if (error.code && Object.hasOwn(BY_CODE, error.code)) {
    return BY_CODE[error.code];
  }

  if (error.message) {
    for (const [pattern, key] of BY_MESSAGE) {
      if (pattern.test(error.message)) return key;
    }
  }

  return "auth.error.generic";
}
