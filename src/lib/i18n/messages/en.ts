import type { MessageKey } from "./pl";

/**
 * Typed against the Polish key space on purpose: `Record<MessageKey, string>` turns a missing
 * translation into a type error. Do not widen this type or add keys that are not in `./pl.ts` —
 * the Polish catalog is the one that defines what exists.
 *
 * The type error only surfaces under `npm run check`; `astro build` does not typecheck. See the
 * note in `./pl.ts`.
 */
export const en: Record<MessageKey, string> = {
  "app.name": "Arrivo",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.soon": "Coming soon",
  "common.loading": "Loading…",

  "nav.dashboard": "Dashboard",
  "nav.discover": "Discover",
  "nav.profile": "Profile",
  "nav.services": "Services",
  "nav.signIn": "Sign in",
  "nav.signUp": "Sign up",
  "nav.signOut": "Sign out",
  "nav.signedOut": "Not signed in",

  "language.label": "Language",
  "language.pl": "Polski",
  "language.en": "English",
  "language.switchTo": "Switch to {language}",

  "role.client": "Client",
  "role.specialist": "Specialist",

  // --- Auth screens ---------------------------------------------------------------------

  "auth.signIn.title": "Good to see you",
  "auth.signIn.subtitle": "Sign in to your account",
  "auth.signIn.submit": "Sign in",
  "auth.signIn.pending": "Signing in…",

  "auth.signUp.title": "Create an account",
  "auth.signUp.subtitle": "First, tell us who you are",
  "auth.signUp.submit": "Create account",
  "auth.signUp.pending": "Creating account…",

  "auth.forgot.title": "Forgot your password?",
  "auth.forgot.subtitle": "We'll send you a link to set a new one",
  "auth.forgot.submit": "Send link",
  "auth.forgot.pending": "Sending…",

  "auth.forgotSent.title": "Check your inbox",
  "auth.forgotSent.body":
    "If an account exists for that address, we've sent it a link to set a new password. The link is valid for one hour.",

  "auth.reset.title": "Set a new password",
  "auth.reset.subtitle": "You'll sign in with it once it's saved",
  "auth.reset.submit": "Save password",
  "auth.reset.pending": "Saving…",

  "auth.confirmEmail.title": "Confirm your email",
  "auth.confirmEmail.body": "We've sent you a confirmation link. Open it to finish setting up your account.",
  "auth.confirmEmail.devTitle": "Account created",
  "auth.confirmEmail.devBody": "You can sign in now.",

  "auth.field.email": "Email address",
  "auth.field.emailPlaceholder": "you@example.com",
  "auth.field.password": "Password",
  "auth.field.passwordPlaceholder": "••••••••",
  "auth.field.newPassword": "New password",
  "auth.field.newPasswordPlaceholder": "At least {min} characters",
  "auth.field.confirmPassword": "Confirm password",
  "auth.field.confirmPasswordPlaceholder": "Re-enter your password",
  "auth.field.passwordHint": "At least {min} characters",
  "auth.field.showPassword": "Show password",
  "auth.field.hidePassword": "Hide password",

  "auth.link.forgot": "Forgot your password?",
  "auth.link.noAccount": "Don't have an account yet?",
  "auth.link.haveAccount": "Already have an account?",
  "auth.link.backToSignIn": "Back to sign in",

  "auth.role.legend": "Who are you?",
  "auth.role.client.title": "I'm a client",
  "auth.role.client.description": "I'm looking for a specialist who comes to me",
  "auth.role.specialist.title": "I'm a specialist",
  "auth.role.specialist.description": "I offer services at the client's place",

  "auth.error.generic": "Something went wrong — please try again",
  "auth.error.notConfigured": "Signing in is temporarily unavailable — try again later",
  "auth.error.emailInvalid": "Enter a valid email address",
  "auth.error.passwordRequired": "Enter your password",
  "auth.error.passwordTooShort": "Password must be at least {min} characters",
  "auth.error.roleRequired": "Choose whether you're a client or a specialist",
  "auth.error.confirmRequired": "Confirm your password",
  "auth.error.passwordsMismatch": "The passwords don't match",
  "auth.error.invalidCredentials": "Incorrect email or password",
  "auth.error.emailNotConfirmed": "Confirm your email address first — check your inbox",
  "auth.error.rateLimited": "Too many attempts — wait a moment and try again",
  "auth.error.weakPassword": "That password is too weak — pick another",
  "auth.error.samePassword": "The new password must differ from the old one",
  "auth.error.linkExpired": "That link expired or is invalid — request a new one",
  "auth.error.sessionExpired": "Your session expired — sign in again",

  "auth.message.alreadyRegistered": "That address is already registered — sign in instead",
  "auth.message.passwordUpdated": "Password updated — sign in",

  // --- Dashboard ------------------------------------------------------------------------

  "dashboard.title": "Dashboard",
  "dashboard.greeting": "Welcome back",
  "dashboard.specialist.profile.title": "Your profile",
  "dashboard.specialist.profile.description": "Your name and the districts you travel to",
  "dashboard.specialist.services.title": "Your services",
  "dashboard.specialist.services.description": "What you offer and what it costs",
  "dashboard.client.discover.title": "Find a specialist",
  "dashboard.client.discover.description": "Browse specialists who travel to your area",
  "dashboard.client.profile.title": "Your profile",
  "dashboard.client.profile.description": "Address and contact details",
};
