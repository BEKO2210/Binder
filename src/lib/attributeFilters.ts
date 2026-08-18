import { ENUM_ATTRIBUTES, HEIGHT_MAX_CM, HEIGHT_MIN_CM, ZODIAC_SIGNS, type EnumAttributeId } from './profileAttributes.ts';

// The filterable vocabularies: the nine profile enums plus the computed
// zodiac. The stored filter shape is exactly what the server validates in
// private.valid_attribute_filters — one object, codes only.
export const FILTER_FIELDS = [
  ...ENUM_ATTRIBUTES.map((field) => ({ id: field.id as string, values: field.values as readonly string[] })),
  { id: 'zodiac', values: ZODIAC_SIGNS as readonly string[] },
] as const;

export type FilterFieldId = EnumAttributeId | 'zodiac';

export type AttributeFilters = {
  height_min_cm?: number;
  height_max_cm?: number;
} & Partial<Record<FilterFieldId, string[]>>;

/**
 * Toggle one code inside one vocabulary filter.
 *
 * An empty selection means "anything" and is stored as an absent key, never as
 * an empty array — the server refuses empty arrays precisely so that "filter
 * that matches nobody" cannot be written by accident.
 */
export function toggleFilterValue(filters: AttributeFilters, field: FilterFieldId, value: string): AttributeFilters {
  const current = filters[field] ?? [];
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  const { [field]: _removed, ...rest } = filters;
  return next.length === 0 ? rest : { ...rest, [field]: next };
}

export function clearFilterField(filters: AttributeFilters, field: FilterFieldId | 'height'): AttributeFilters {
  if (field === 'height') {
    const { height_min_cm: _min, height_max_cm: _max, ...rest } = filters;
    return rest;
  }
  const { [field]: _removed, ...rest } = filters;
  return rest;
}

/** A height bound, kept inside the server range and never inverted. */
export function setHeightBound(filters: AttributeFilters, bound: 'min' | 'max', value: number | null): AttributeFilters {
  const key = bound === 'min' ? 'height_min_cm' : 'height_max_cm';
  const { height_min_cm, height_max_cm, ...rest } = filters;
  const next: AttributeFilters = { ...rest };
  if (height_min_cm !== undefined) next.height_min_cm = height_min_cm;
  if (height_max_cm !== undefined) next.height_max_cm = height_max_cm;
  if (value === null) {
    delete next[key];
    return next;
  }
  const clamped = Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, Math.round(value)));
  next[key] = clamped;
  // The other bound yields rather than the pair inverting.
  if (bound === 'min' && next.height_max_cm !== undefined && next.height_max_cm < clamped) next.height_max_cm = clamped;
  if (bound === 'max' && next.height_min_cm !== undefined && next.height_min_cm > clamped) next.height_min_cm = clamped;
  return next;
}

export function activeFilterCount(filters: AttributeFilters): number {
  let count = 0;
  if (filters.height_min_cm !== undefined || filters.height_max_cm !== undefined) count += 1;
  for (const field of FILTER_FIELDS) {
    const selection = filters[field.id as FilterFieldId];
    if (selection && selection.length > 0) count += 1;
  }
  return count;
}

/**
 * Read whatever the preferences row holds into a shape the sheet can edit.
 * Unknown keys and malformed values are dropped, not crashed on — the server
 * validates writes, but this read must survive anything.
 */
export function parseStoredFilters(value: unknown): AttributeFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const result: AttributeFilters = {};
  for (const bound of ['height_min_cm', 'height_max_cm'] as const) {
    const entry = raw[bound];
    if (typeof entry === 'number' && entry >= HEIGHT_MIN_CM && entry <= HEIGHT_MAX_CM) result[bound] = Math.round(entry);
  }
  for (const field of FILTER_FIELDS) {
    const entry = raw[field.id];
    if (Array.isArray(entry)) {
      const known = entry.filter((code): code is string => typeof code === 'string' && field.values.includes(code));
      if (known.length > 0) result[field.id as FilterFieldId] = known;
    }
  }
  return result;
}

/** The exact object sent to the server: {} when nothing is filtered. */
export function filtersPayload(filters: AttributeFilters): Record<string, number | string[]> {
  const payload: Record<string, number | string[]> = {};
  if (filters.height_min_cm !== undefined) payload.height_min_cm = filters.height_min_cm;
  if (filters.height_max_cm !== undefined) payload.height_max_cm = filters.height_max_cm;
  for (const field of FILTER_FIELDS) {
    const selection = filters[field.id as FilterFieldId];
    if (selection && selection.length > 0) payload[field.id] = [...selection];
  }
  return payload;
}
