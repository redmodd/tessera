/**
 * xAPI Identified Agent and Basic-auth credential validation rules.
 *
 * Pure logic — no Svelte/runtime imports. Imported by both `publisher.ts`
 * (runtime validation of resolved actor / auth) and `plugin/validation.ts`
 * (build-time validation of static `course.config.js` actor / auth).
 * Keeping the rules in one place prevents the two callsites from drifting.
 */

/** Join a field label with a validator suffix: `.foo` chains, others get `: `. */
export function joinFieldError(label: string, suffix: string): string {
  return suffix.startsWith('.') ? `${label}${suffix}` : `${label}: ${suffix}`;
}

/**
 * Validate that a candidate is an Identified Agent per xAPI 1.0.3.
 * Returns null on success or a human-readable error suffix on failure.
 *
 * Suffixes are prefix-friendly: callers concatenate their own label
 * (`xapi.actor`, `xapi[0].actor`, etc.) with a single space — no "actor"
 * appears in the suffix to avoid doubling.
 */
export function validateAgent(actor: unknown): string | null {
  if (!actor || typeof actor !== 'object') {
    return 'must be an object';
  }
  const a = actor as Record<string, unknown>;
  if (Array.isArray(a.member) && a.member.length > 0) {
    return 'is a Group (has `member`); v1 supports Identified Agents only';
  }
  let count = 0;
  if (a.mbox !== undefined) count++;
  if (a.mbox_sha1sum !== undefined) count++;
  if (a.openid !== undefined) count++;
  if (a.account !== undefined) count++;
  if (count === 0) {
    return 'must have one of mbox, mbox_sha1sum, openid, or account (Identified Agent rule)';
  }
  if (count > 1) {
    return 'must have exactly one IFI (mbox / mbox_sha1sum / openid / account), not multiple';
  }
  if (a.mbox !== undefined) {
    if (typeof a.mbox !== 'string' || !a.mbox.startsWith('mailto:')) {
      return '.mbox must be a string starting with "mailto:"';
    }
  }
  if (a.mbox_sha1sum !== undefined) {
    if (
      typeof a.mbox_sha1sum !== 'string' ||
      !/^[0-9a-f]{40}$/i.test(a.mbox_sha1sum)
    ) {
      return '.mbox_sha1sum must be a 40-character hex string';
    }
  }
  if (a.openid !== undefined) {
    if (typeof a.openid !== 'string' || !a.openid) {
      return '.openid must be a non-empty string';
    }
    try {
      new URL(a.openid);
    } catch {
      return '.openid must be an absolute URI';
    }
  }
  if (a.account !== undefined) {
    const acc = a.account as Record<string, unknown>;
    if (!acc || typeof acc !== 'object') {
      return '.account must be an object with homePage and name';
    }
    if (typeof acc.homePage !== 'string' || !acc.homePage) {
      return '.account.homePage must be a non-empty string';
    }
    try {
      new URL(acc.homePage);
    } catch {
      return '.account.homePage must be an absolute URL';
    }
    if (typeof acc.name !== 'string' || !acc.name) {
      return '.account.name must be a non-empty string';
    }
  }
  return null;
}

/**
 * Validate a Basic-auth credential string (the value after "Basic ").
 * v1 supports Basic only. Bearer is a hard error so OAuth users see the
 * non-goal explicitly.
 */
export function validateAuthCredential(auth: string): string | null {
  if (typeof auth !== 'string' || !auth) {
    return 'must be a non-empty string';
  }
  if (/^basic\s/i.test(auth)) {
    return "must be the Basic credential value only, not the full header. Drop the 'Basic ' prefix.";
  }
  if (/^bearer\s/i.test(auth)) {
    return 'Bearer/OAuth credentials are not supported in v1. Use Basic auth, or wrap your token-exchange in an auth function that returns a Basic credential.';
  }
  return null;
}
