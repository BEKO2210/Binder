import { View } from 'react-native';

import {
  attributeLabelKey,
  attributeValueKey,
  clampHeight,
  ENUM_ATTRIBUTES,
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  type ProfileAttributes,
} from '../lib/profileAttributes';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderChip, BinderIconButton, BinderText } from './ui';

type Props = {
  value: ProfileAttributes;
  onChange: (next: ProfileAttributes) => void;
};

// A sensible place to start counting from when somebody first taps the
// stepper; nothing is stored until they save.
const HEIGHT_START_CM = 170;
const HEIGHT_STEP_CM = 1;

/**
 * The ten optional attributes, every one of them skippable.
 *
 * Each vocabulary renders as chips with an explicit "not specified" chip in
 * front — clearing an answer is a first-class choice, not a hidden gesture.
 * Height is the one numeric field and uses stepper buttons, never a slider:
 * a slider on a scrolling screen changes value while the person is merely
 * scrolling past it.
 */
export function AttributeEditor({ value, onChange }: Props) {
  const { theme, t } = useBinderTheme();

  const setHeight = (next: number | null) => onChange({ ...value, height_cm: next === null ? null : clampHeight(next) });
  const height = value.height_cm;

  return (
    <View style={{ gap: theme.spacing.x5 }}>
      <View>
        <BinderText variant="eyebrow" tone="accent">{t('identity.attributes.sectionTitle')}</BinderText>
      </View>

      <View style={{ gap: theme.spacing.x2 }}>
        <BinderText variant="label">{t('identity.attributes.height.label')}</BinderText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
          <BinderIconButton
            name="decrease"
            size={19}
            accessibilityLabel={t('identity.attributes.height.decrease')}
            disabled={height !== null && height <= HEIGHT_MIN_CM}
            onPress={() => setHeight(height === null ? HEIGHT_START_CM : height - HEIGHT_STEP_CM)}
          />
          <BinderText variant="label" style={{ minWidth: 72, textAlign: 'center' }}>
            {height === null ? t('identity.attributes.notSet') : t('identity.attributes.height.format', { height })}
          </BinderText>
          <BinderIconButton
            name="increase"
            size={19}
            accessibilityLabel={t('identity.attributes.height.increase')}
            disabled={height !== null && height >= HEIGHT_MAX_CM}
            onPress={() => setHeight(height === null ? HEIGHT_START_CM : height + HEIGHT_STEP_CM)}
          />
          {height !== null ? (
            <BinderChip label={t('identity.attributes.notSet')} onPress={() => setHeight(null)} />
          ) : null}
        </View>
      </View>

      {ENUM_ATTRIBUTES.map((field) => (
        <View key={field.id} style={{ gap: theme.spacing.x2 }}>
          <BinderText variant="label">{t(attributeLabelKey(field.id))}</BinderText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
            <BinderChip
              label={t('identity.attributes.notSet')}
              selected={value[field.id] === null}
              onPress={() => onChange({ ...value, [field.id]: null })}
            />
            {field.values.map((option) => (
              <BinderChip
                key={option}
                label={t(attributeValueKey(field.id, option))}
                selected={value[field.id] === option}
                onPress={() => onChange({ ...value, [field.id]: option })}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
