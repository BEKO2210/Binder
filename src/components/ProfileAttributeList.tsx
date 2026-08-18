import { View } from 'react-native';

import {
  attributeLabelKey,
  attributeValueKey,
  ENUM_ATTRIBUTES,
  type ProfileAttributes,
} from '../lib/profileAttributes';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderText } from './ui';

type Props = {
  attributes: ProfileAttributes;
  zodiac: string | null;
};

/**
 * The attribute rows a visitor sees: label on the left, answer on the right.
 *
 * Only answered attributes render — an attribute is an offer, and an empty
 * one is silence, not a row of dashes. Values that read alike on their own
 * ("sometimes" under smoking and under drinking) stay unambiguous because the
 * label always travels with the value.
 */
export function ProfileAttributeList({ attributes, zodiac }: Props) {
  const { theme, t } = useBinderTheme();

  const rows: { key: string; label: string; value: string }[] = [];
  if (attributes.height_cm !== null) {
    rows.push({ key: 'height', label: t('identity.attributes.height.label'), value: t('identity.attributes.height.format', { height: attributes.height_cm }) });
  }
  if (zodiac) {
    rows.push({ key: 'zodiac', label: t('identity.attributes.zodiac.label'), value: t(`identity.attributes.zodiac.values.${zodiac}`) });
  }
  for (const field of ENUM_ATTRIBUTES) {
    const value = attributes[field.id];
    if (value !== null) {
      rows.push({ key: field.id, label: t(attributeLabelKey(field.id)), value: t(attributeValueKey(field.id, value)) });
    }
  }
  if (rows.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.x2 }}>
      {rows.map((row) => (
        <View key={row.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.x3 }}>
          <BinderText variant="caption" tone="secondary">{row.label}</BinderText>
          <BinderText variant="label" style={{ flexShrink: 1, textAlign: 'right' }}>{row.value}</BinderText>
        </View>
      ))}
    </View>
  );
}
