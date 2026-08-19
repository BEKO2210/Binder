export type EmptyDiscoveryKind = 'filtered' | 'genuine';

/** Only server-confirmed availability under the standard values may blame filters. */
export function classifyEmptyDiscovery(currentCount: number, standardCount: number): EmptyDiscoveryKind {
  return currentCount === 0 && standardCount > 0 ? 'filtered' : 'genuine';
}

/**
 * Which filter values the emptiness of a deck must be judged by.
 *
 * Applying a filter set the state and called the reload in the same tick, so
 * the reload still read the previous values and counted with them. The count
 * came back greater than zero, the deck was empty, and the screen told the
 * person they were up to date — no mention of the filter they had just set and
 * no way back to it. Only after leaving the tab and returning did it say
 * "Filter schränken dein Deck ein".
 *
 * What was just applied wins over what is in state, which wins over what is
 * stored on the server.
 */
export function filterValuesToCountWith<T>(applied: T | undefined, inState: T | null): T | null {
  return applied ?? inState;
}
