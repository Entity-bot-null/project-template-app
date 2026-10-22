import type { RouteLimit } from '../common/guards/rate-limit.guard.js';

/** Access token lifetime: short, the refresh token renews it. */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
/** Pinned on the signer and on every verifier. */
export const ACCESS_TOKEN_ALGORITHM = 'HS256';
/** Refresh session lifetime, renewed on every rotation (sliding). */
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
/**
 * The reuse window: a refresh token presented again this soon after its
 * rotation is a renewal whose answer was lost (a dropped connection, a retry),
 * not a replay. It gets a new pair, and the successor nobody received is
 * replaced (docs/adr/0007-mobile-sessions-with-refresh-tokens-in-the-body.md).
 */
export const REFRESH_REUSE_LEEWAY_SEC = 30;
/** Absolute lifetime of a sign-in: rotations never extend a session past it. */
export const REFRESH_FAMILY_MAX_AGE_SEC = 90 * 24 * 60 * 60;
/** Stale sessions are swept at boot and on this interval. */
export const SESSION_SWEEP_INTERVAL_SEC = 60 * 60;

/** argon2 has no practical input limit; this bounds the work per request. In characters (code points). */
export const PASSWORD_MAX_LENGTH = 200;
/**
 * The same bound as a request carries it, in UTF-16 units (a JSON string's
 * length): two per character at most, so a password of PASSWORD_MAX_LENGTH
 * characters always fits, whatever its characters.
 */
export const PASSWORD_MAX_INPUT_LENGTH = PASSWORD_MAX_LENGTH * 2;

/** A password reset link works this long after the message is sent. */
export const PASSWORD_RESET_TTL_MS = 30 * 60_000;

/** Public sign-up is open (SIGN_UP_ENABLED): the injection token, so specs can turn it on. */
export const SIGN_UP_ENABLED = Symbol('SIGN_UP_ENABLED');
/** A sign-up's confirmation link works this long after the message is sent. */
export const SIGN_UP_TTL_MS = 24 * 60 * 60_000;
/** Wrong passwords given with one sign-up's link before the sign-up is dropped. */
export const SIGN_UP_MAX_FAILED_ATTEMPTS = 5;

/** The link that confirms a new address works this long after it is sent. */
export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60_000;
/** The link that undoes a change of address, sent to the previous one, works this long. */
export const EMAIL_REVERT_TTL_MS = 7 * 24 * 60 * 60_000;
/** An invitation's link works this long after it is sent. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60_000;
/** An invitation's message is worth sending this long after it is queued. */
export const INVITATION_MESSAGE_TTL_MS = 24 * 60 * 60_000;

// Counted on top of the global limit (RATE_LIMIT_MAX), not instead of it: both
// apply, and whichever runs out first blocks (@RouteRateLimit,
// common/guards/rate-limit.guard.ts). Phones often share an address (carrier
// NAT): no route counts per client IP alone. Signed-in routes count per
// person; public ones per account and client IP (the address tried, the
// token presented), so one person's attempts never block the others behind
// the same address, with a ceiling per address sized for many people
// (docs/security.md#rate-limiting).

/** Every public route's ceiling of attempts per client IP, in a window. */
const PUBLIC_IP_CEILING = { limit: 100, ttlSec: 15 * 60 };

// Sign-in: credential stuffing protection, per address tried.
export const SIGN_IN_RATE_LIMIT: RouteLimit = {
  limit: 10,
  ttlSec: 60,
  per: 'email',
  ipCeiling: { limit: 300, ttlSec: 60 },
};
// Renewal: a refresh token works once (plus its retries), so a handful per
// token is plenty; the ceiling bounds lookups of made-up tokens.
export const REFRESH_RATE_LIMIT: RouteLimit = {
  limit: 10,
  ttlSec: 60,
  per: 'refreshToken',
  ipCeiling: { limit: 600, ttlSec: 60 },
};
// Asking for a reset link, per address; each address also gets at most one
// message a minute and MAIL_DAILY_LIMIT_PER_ADDRESS a day (the outbox). The
// ceiling is tighter than the others': each request may send a message.
export const PASSWORD_RESET_REQUEST_RATE_LIMIT: RouteLimit = {
  limit: 5,
  ttlSec: 15 * 60,
  per: 'email',
  ipCeiling: { limit: 50, ttlSec: 15 * 60 },
};
// Using a reset link: a token is 256 random bits, nothing to guess; this
// bounds the hashing work a client can cause.
export const PASSWORD_RESET_CONFIRM_RATE_LIMIT: RouteLimit = {
  limit: 10,
  ttlSec: 15 * 60,
  per: 'token',
  ipCeiling: PUBLIC_IP_CEILING,
};
// Changing the password while signed in: each attempt checks the current
// password, so it is limited like a sign-in, per person.
export const PASSWORD_CHANGE_RATE_LIMIT: RouteLimit = { limit: 5, ttlSec: 15 * 60, per: 'user' };
// Signing up, per address: each request hashes a password and may send a
// message (each address also gets at most one a minute and a few a day). The
// ceiling is tighter than the others': each request may send a message.
export const SIGN_UP_RATE_LIMIT: RouteLimit = {
  limit: 5,
  ttlSec: 15 * 60,
  per: 'email',
  ipCeiling: { limit: 50, ttlSec: 15 * 60 },
};
// Confirming a sign-up checks the password chosen with it: limited like a
// sign-in, besides the attempts each sign-up allows.
export const SIGN_UP_CONFIRM_RATE_LIMIT: RouteLimit = {
  limit: 10,
  ttlSec: 15 * 60,
  per: 'token',
  ipCeiling: PUBLIC_IP_CEILING,
};
// Asking to change the address checks the current password: limited like a
// sign-in, per person. Confirming or undoing a change takes a 256-bit token
// (undoing also hashes a new password): this bounds the work a client can
// cause.
export const EMAIL_CHANGE_RATE_LIMIT: RouteLimit = { limit: 5, ttlSec: 15 * 60, per: 'user' };
export const EMAIL_CHANGE_LINK_RATE_LIMIT: RouteLimit = {
  limit: 10,
  ttlSec: 15 * 60,
  per: 'token',
  ipCeiling: PUBLIC_IP_CEILING,
};
// Deleting the account checks the current password: limited like a sign-in,
// per person.
export const ACCOUNT_DELETION_RATE_LIMIT: RouteLimit = { limit: 5, ttlSec: 15 * 60, per: 'user' };
// Inviting (administrators): each invitation sends a message; each address
// also gets at most one a minute and a few a day.
export const INVITATION_RATE_LIMIT: RouteLimit = { limit: 30, ttlSec: 15 * 60, per: 'user' };
// Accepting an invitation hashes the chosen password: this bounds the work.
export const INVITATION_ACCEPT_RATE_LIMIT: RouteLimit = {
  limit: 10,
  ttlSec: 15 * 60,
  per: 'token',
  ipCeiling: PUBLIC_IP_CEILING,
};

export { normalizeEmail } from '../common/utils/email.js';
