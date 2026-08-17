export type EmptyDiscoveryKind = 'filtered' | 'genuine';

/** Only server-confirmed availability under the standard values may blame filters. */
export function classifyEmptyDiscovery(currentCount: number, standardCount: number): EmptyDiscoveryKind {
  return currentCount === 0 && standardCount > 0 ? 'filtered' : 'genuine';
}
