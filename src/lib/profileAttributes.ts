// The ten profile attributes and the vocabulary the server accepts for each.
// The stored value is always the English code ('never', 'vegan', …) — exactly
// like interests and genders, the label is a translation and the code is data.
// The server enforces the same lists through CHECK constraints, so this file
// must stay in step with phase10_profile_attributes.sql.

export const ZODIAC_SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const;

export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;

export const ENUM_ATTRIBUTES = [
  { id: 'smoking', values: ['never', 'sometimes', 'regularly'] },
  { id: 'drinking', values: ['never', 'sometimes', 'regularly'] },
  { id: 'drugs', values: ['never', 'sometimes', 'regularly'] },
  { id: 'activity', values: ['rarely', 'sometimes', 'often', 'daily'] },
  { id: 'diet', values: ['omnivore', 'flexitarian', 'pescetarian', 'vegetarian', 'vegan', 'halal', 'kosher'] },
  { id: 'spirituality', values: ['none', 'spiritual', 'christian', 'muslim', 'jewish', 'buddhist', 'hindu', 'other'] },
  { id: 'children_has', values: ['no', 'yes'] },
  { id: 'children_wants', values: ['no', 'maybe', 'yes'] },
  { id: 'car', values: ['no', 'yes'] },
] as const;

export type EnumAttributeId = (typeof ENUM_ATTRIBUTES)[number]['id'];

export type ProfileAttributes = {
  height_cm: number | null;
} & Record<EnumAttributeId, string | null>;

export const EMPTY_ATTRIBUTES: ProfileAttributes = {
  height_cm: null,
  smoking: null,
  drinking: null,
  drugs: null,
  activity: null,
  diet: null,
  spirituality: null,
  children_has: null,
  children_wants: null,
  car: null,
};

const ATTRIBUTE_KEYS = ['height_cm', ...ENUM_ATTRIBUTES.map((field) => field.id)] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

// snake_case ids double as i18n path segments; the label files use camelCase
// leaves like everything else, so 'children_has' reads keys under 'childrenHas'.
export function attributeKeySegment(id: AttributeKey): string {
  return id === 'height_cm' ? 'height' : id.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function attributeLabelKey(id: AttributeKey): string {
  return `identity.attributes.${attributeKeySegment(id)}.label`;
}

export function attributeValueKey(id: EnumAttributeId, value: string): string {
  return `identity.attributes.${attributeKeySegment(id)}.values.${value}`;
}

export function zodiacLabelKey(sign: string): string {
  return `identity.attributes.zodiac.values.${sign}`;
}

export function clampHeight(value: number): number {
  return Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, Math.round(value)));
}

export function rowsFromProfile(row: Partial<Record<AttributeKey, unknown>>): ProfileAttributes {
  const result: ProfileAttributes = { ...EMPTY_ATTRIBUTES };
  if (typeof row.height_cm === 'number') result.height_cm = row.height_cm;
  for (const field of ENUM_ATTRIBUTES) {
    const value = row[field.id];
    if (typeof value === 'string' && (field.values as readonly string[]).includes(value)) {
      result[field.id] = value;
    }
  }
  return result;
}

/**
 * The payload for p_attributes: only what changed.
 *
 * The server's contract is positional — a key that is absent stays untouched,
 * a key set to null clears the column, a key with a value sets it. Sending
 * only the delta means a save from a screen that never loaded an attribute
 * cannot wipe it, the exact trap the filter sheet's profile echo fell into
 * with interests.
 */
export function attributesPayload(before: ProfileAttributes, after: ProfileAttributes): Record<string, string | number | null> | null {
  const payload: Record<string, string | number | null> = {};
  for (const key of ATTRIBUTE_KEYS) {
    if (before[key] !== after[key]) payload[key] = after[key];
  }
  return Object.keys(payload).length === 0 ? null : payload;
}
