// The picker's decisions, kept away from React so node:test can run them.
//
// Search matches on the translated label — a German speaker types "Wandern",
// not "Hiking" — and on the stored id as a fallback, so the twelve legacy
// English values stay findable in every language. While a search is active the
// category structure yields to a flat result list: collapsing sections during
// a search would hide the very matches that were asked for.
import { INTEREST_CATALOG, INTEREST_SELECTION_LIMIT, type InterestCategoryId, type InterestEntry } from './interestCatalog.ts';

export type PickerSection = { categoryId: InterestCategoryId; entries: readonly InterestEntry[] };

export function searchCatalog(query: string, labelOf: (entry: InterestEntry) => string): readonly InterestEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return INTEREST_CATALOG.filter((entry) =>
    labelOf(entry).toLocaleLowerCase().includes(needle) || entry.id.toLowerCase().includes(needle));
}

/**
 * What tapping a chip does to the selection.
 *
 * Deselecting always works — including for a profile that holds more than the
 * limit (legacy rows may carry twelve, the picker offers ten): somebody over
 * the limit can always reduce, and is never trapped by it. Selecting past the
 * limit returns the selection unchanged rather than throwing, because a tap on
 * a full picker is an ordinary moment, not an error.
 */
export function toggleInterest(selection: readonly string[], id: string, limit = INTEREST_SELECTION_LIMIT): readonly string[] {
  if (selection.includes(id)) return selection.filter((value) => value !== id);
  if (selection.length >= limit) return selection;
  return [...selection, id];
}

export function selectionCountLabel(selection: readonly string[], limit = INTEREST_SELECTION_LIMIT): { count: number; max: number } {
  return { count: selection.length, max: limit };
}

/** Ids stored on a profile that the catalogue does not know (very old or
 * hand-written values). They still render — via the stored-word fallback — and
 * they still count against the limit, but they get no chip in the picker. */
export function unknownSelections(selection: readonly string[], known: ReadonlySet<string>): readonly string[] {
  return selection.filter((id) => !known.has(id));
}
