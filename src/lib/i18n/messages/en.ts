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

  // --- Specialist panel -----------------------------------------------------------------

  "specialist.profile.title": "Your profile",
  "specialist.profile.subtitle": "This is what clients see when they find you",
  "specialist.profile.save": "Save profile",
  "specialist.profile.saving": "Saving…",

  "specialist.services.title": "Your services",
  "specialist.services.subtitle": "What you offer and what it costs",
  "specialist.services.add": "Add service",
  "specialist.services.adding": "Adding…",
  "specialist.services.remove": "Remove",
  "specialist.services.removeLabel": "Remove {name}",
  "specialist.services.empty": "No services yet. Add your first one to make your card visible.",
  "specialist.services.duration": "{minutes} min",

  "specialist.card.liveTitle": "Your card is live",
  "specialist.card.liveBody": "Clients in your districts can find you.",
  "specialist.card.incompleteTitle": "Not visible to clients yet",
  "specialist.card.incompleteBody": "Still needed: {missing}.",
  "specialist.card.missingName": "a name",
  "specialist.card.missingArea": "at least one district",
  "specialist.card.missingService": "at least one service",

  "specialist.field.displayName": "Name clients will see",
  "specialist.field.displayNamePlaceholder": "e.g. Studio Ala",
  "specialist.field.bio": "About you",
  "specialist.field.bioOptional": "(optional)",
  "specialist.field.bioPlaceholder": "A few sentences about your experience and how you work.",
  "specialist.field.areas": "Districts you travel to",
  "specialist.field.areasSelected": "Selected: {count}",
  "specialist.field.city": "City",
  "specialist.field.selectAllInCity": "Select whole city",
  "specialist.field.clearCity": "Clear whole city",

  "specialist.field.serviceType": "Service type",
  "specialist.field.serviceDetail": "Detail",
  "specialist.field.serviceDetailOptional": "(optional)",
  "specialist.field.serviceName": "Your own name for it",
  "specialist.field.serviceNameOptional": "(optional)",
  "specialist.field.serviceNamePlaceholder": "e.g. Colouring + conditioner",
  "specialist.field.price": "Price (zł)",
  "specialist.field.pricePlaceholder": "120 or 120.50",
  "specialist.field.duration": "Duration (min)",
  "specialist.field.durationOptional": "(optional)",
  "specialist.field.durationPlaceholder": "60",
  "specialist.field.choose": "Choose…",
  "specialist.field.noDetail": "No detail",
  "specialist.field.chooseTypeFirst": "Choose a service type first",

  "specialist.error.nameRequired": "Enter a name clients will see",
  "specialist.error.nameTooShort": "Name must be at least {min} characters",
  "specialist.error.nameTooLong": "Name must be at most {max} characters",
  "specialist.error.areaRequired": "Pick at least one district you serve",
  "specialist.error.areaTooMany": "Too many districts selected",
  "specialist.error.bioTooLong": "The description must be at most {max} characters",
  "specialist.error.typeRequired": "Choose a service type",
  "specialist.error.subtypeInvalid": "Choose a valid option for that service type",
  "specialist.error.serviceNameLength": "The service name must be between {min} and {max} characters",
  "specialist.error.priceRequired": "Enter a price",
  "specialist.error.priceFormat": "Enter a price in złoty, e.g. 120 or 120.50",
  "specialist.error.priceRange": "Price must be between {min} zł and {max} zł",
  "specialist.error.durationRange": "Duration must be between {min} and {max} minutes",
  "specialist.error.notAllowed": "You need a specialist account to do that",
  "specialist.error.noCard": "Save your profile first, then add services",
  "specialist.error.saveFailed": "Could not save — please try again",
  "specialist.error.addFailed": "Could not add the service — please try again",
  "specialist.error.loadProfile": "Could not load your profile — refresh to try again",
  "specialist.error.loadServices": "Could not load your services — refresh to try again",
  "specialist.error.notConfigured": "Saving is temporarily unavailable — try again later",

  "specialist.message.profileSaved": "Profile saved",
  "specialist.message.serviceAdded": "Service added",
  "specialist.message.serviceRemoved": "Service removed",
  "specialist.message.serviceGone": "That service no longer exists",

  // --- Client account -------------------------------------------------------------------

  "account.title": "Your profile",
  "account.subtitle": "A specialist sees these details only after accepting a booking",
  "account.save": "Save changes",
  "account.saving": "Saving…",
  "account.privacyNote":
    "Only a specialist who accepts your booking sees your exact address. Until then we use the district alone for matching.",

  "account.field.firstName": "First name",
  "account.field.lastName": "Last name",
  "account.field.phone": "Phone",
  "account.field.phonePlaceholder": "+48 600 000 000",
  "account.field.street": "Street and number",
  "account.field.streetPlaceholder": "ul. Kwiatowa 12/3",
  "account.field.postalCode": "Postal code",
  "account.field.postalCodePlaceholder": "00-001",
  "account.field.area": "Your district",

  "account.error.areaRequired": "Choose the district you live in",
  "account.error.nameLength": "This field must be at most {max} characters",
  "account.error.phoneLength": "The phone number must be between {min} and {max} characters",
  "account.error.streetLength": "The address must be between {min} and {max} characters",
  "account.error.postalCodeFormat": "Postal code in the format 00-001",
  "account.error.notAllowed": "You need a client account to do that",
  "account.error.saveFailed": "Could not save — please try again",
  "account.error.loadFailed": "Could not load your profile — refresh to try again",
  "account.error.notConfigured": "Saving is temporarily unavailable — try again later",
  "account.message.saved": "Profile saved",

  // --- Discovery ------------------------------------------------------------------------

  "discovery.title": "Specialists near you",
  "discovery.subtitleArea": "{area} · showing only those who travel to your area",
  "discovery.subtitleAll": "All specialists",
  "discovery.servesMyArea": "Travels to me",
  "discovery.allCategories": "All categories",
  "discovery.priceFrom": "Price from",
  "discovery.priceTo": "Price to",
  "discovery.sortPriceAsc": "Price, low to high",
  "discovery.sortPriceDesc": "Price, high to low",
  "discovery.apply": "Show",
  "discovery.clear": "Clear filters",
  "discovery.from": "from {price}",
  "discovery.travelsTo": "Travels to: {areas}",
  "discovery.newSpecialist": "New specialist",
  "discovery.ratingSummary": "{average} of 5 ({count})",

  "discovery.empty.title": "No results",
  "discovery.empty.filters": "Try widening the price range or picking another category.",
  "discovery.empty.area": "Nobody travels to your district yet. Uncheck “Travels to me” to see everyone.",
  "discovery.empty.none": "There are no specialists yet.",

  "discovery.noAddress.title": "Set your address",
  "discovery.noAddress.body": "Tell us which district you live in and we'll show only specialists who travel to you.",
  "discovery.noAddress.cta": "Set address",

  "discovery.profile.services": "Services",
  "discovery.profile.book": "Book a visit",
  "discovery.profile.bookService": "Book",
  "discovery.profile.backToList": "Discover",
};
