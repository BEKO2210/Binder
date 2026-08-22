// How long a link to a photo or a recording is good for, and when a screen
// that is holding one has to go and get it again.
//
// Half an hour, deliberately short. A signed URL is a bearer token: it keeps
// working until it expires, whatever happens to the block list or the
// moderation state behind it. Stretching it to spare people a stale photo also
// gives a blocked person that long with pictures their app already fetched.
//
// The other half of that promise is this file's second job. Screens fetched
// their links when they mounted and never again, so a phone put in a pocket
// came back after an hour to a profile of grey rectangles with no way to ask
// for them again but leaving the screen and coming back. Two places also
// disagreed about the number — thirty minutes for a profile photo, an hour for
// the same photo inside a conversation — which meant the short one was not
// actually the rule.

export const SIGNED_URL_SECONDS = 60 * 30;
export const SIGNED_URL_LIFETIME_MS = SIGNED_URL_SECONDS * 1000;

/**
 * Reload a little before they die rather than a moment after: a link fetched
 * five minutes before expiry is still a link that will break while somebody is
 * looking at it.
 */
export const SIGNED_URL_MARGIN_MS = 5 * 60 * 1000;

export function signedUrlsAreStale(loadedAt: number, now: number): boolean {
  return now - loadedAt >= SIGNED_URL_LIFETIME_MS - SIGNED_URL_MARGIN_MS;
}
