import { useState } from 'react';
import { View } from 'react-native';

import {
  clearFilterField,
  FILTER_FIELDS,
  setHeightBound,
  toggleFilterValue,
  type AttributeFilters,
  type FilterFieldId,
} from '../lib/attributeFilters';
import { attributeLabelKey, attributeValueKey, HEIGHT_MAX_CM, HEIGHT_MIN_CM, zodiacLabelKey, type EnumAttributeId } from '../lib/profileAttributes';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderButton, BinderChip, BinderIconButton, BinderText } from './ui';

type Props = {
  filters: AttributeFilters;
  onChange: (next: AttributeFilters) => void;
};

const HEIGHT_START_CM = 170;

/**
 * The ten attribute filters, collapsed by default.
 *
 * Every vocabulary is multi-select with an explicit "Any" chip: an empty
 * selection IS "Any", so the chip is selected exactly when no code is chosen,
 * and tapping it clears the field. A candidate who left an attribute
 * unanswered passes every filter — the copy promises matching, not exclusion.
 */
export function AttributeFilterSection({ filters, onChange }: Props) {
  const { theme, t } = useBinderTheme();
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return <BinderButton label={t('discoveryFilterSheet.attributes.show')} variant="secondary" onPress={() => setExpanded(true)} style={{ marginTop: theme.spacing.x6 }} />;
  }

  const heightRow = (bound: 'min' | 'max', value: number | undefined, labelKey: string, a11y: { less: string; more: string }) => (
    <View style={{ gap: theme.spacing.x2 }}>
      <BinderText variant="label">{t(labelKey)}</BinderText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
        <BinderIconButton name="decrease" size={19} accessibilityLabel={a11y.less} disabled={value !== undefined && value <= HEIGHT_MIN_CM} onPress={() => onChange(setHeightBound(filters, bound, value === undefined ? HEIGHT_START_CM : value - 1))} />
        <BinderText variant="label" style={{ minWidth: 72, textAlign: 'center' }}>
          {value === undefined ? t('discoveryFilterSheet.attributes.any') : t('identity.attributes.height.format', { height: value })}
        </BinderText>
        <BinderIconButton name="increase" size={19} accessibilityLabel={a11y.more} disabled={value !== undefined && value >= HEIGHT_MAX_CM} onPress={() => onChange(setHeightBound(filters, bound, value === undefined ? HEIGHT_START_CM : value + 1))} />
        {value !== undefined ? <BinderChip label={t('discoveryFilterSheet.attributes.any')} onPress={() => onChange(setHeightBound(filters, bound, null))} /> : null}
      </View>
    </View>
  );

  return (
    <View style={{ marginTop: theme.spacing.x6, gap: theme.spacing.x5 }}>
      <BinderText variant="title">{t('discoveryFilterSheet.attributes.title')}</BinderText>

      {heightRow('min', filters.height_min_cm, 'discoveryFilterSheet.attributes.heightMin', { less: t('identity.attributes.height.decrease'), more: t('identity.attributes.height.increase') })}
      {heightRow('max', filters.height_max_cm, 'discoveryFilterSheet.attributes.heightMax', { less: t('identity.attributes.height.decrease'), more: t('identity.attributes.height.increase') })}

      {FILTER_FIELDS.map((field) => {
        const id = field.id as FilterFieldId;
        const selection = filters[id] ?? [];
        const labelOf = (code: string) => id === 'zodiac' ? t(zodiacLabelKey(code)) : t(attributeValueKey(id as EnumAttributeId, code));
        return (
          <View key={field.id} style={{ gap: theme.spacing.x2 }}>
            <BinderText variant="label">{id === 'zodiac' ? t('identity.attributes.zodiac.label') : t(attributeLabelKey(id as EnumAttributeId))}</BinderText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
              <BinderChip label={t('discoveryFilterSheet.attributes.any')} selected={selection.length === 0} onPress={() => onChange(clearFilterField(filters, id))} />
              {field.values.map((code) => (
                <BinderChip key={code} label={labelOf(code)} selected={selection.includes(code)} onPress={() => onChange(toggleFilterValue(filters, id, code))} />
              ))}
            </View>
          </View>
        );
      })}

      <BinderButton label={t('discoveryFilterSheet.attributes.hide')} variant="ghost" onPress={() => setExpanded(false)} />
    </View>
  );
}
