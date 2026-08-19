import { View } from 'react-native';

import { radiusSteps } from '../lib/dialScale';
import { discoveryPresets, matchingDiscoveryPreset } from '../lib/discoveryPreferencesPolicy';
import { useBinderTheme } from '../theme/ThemeProvider';
import { GENDERS, type Gender } from '../lib/validation';
import { BinderChip, BinderDial, BinderText } from './ui';

const ageSteps = Array.from({ length: 83 }, (_, index) => index + 18);

export type DiscoveryPreferenceValues = {
  interestedIn: Gender[];
  minAge: number;
  maxAge: number;
  distance: number;
};

type Props = DiscoveryPreferenceValues & {
  onChange: (values: DiscoveryPreferenceValues) => void;
  errors?: { audience?: string; age?: string; distance?: string };
  showPresets?: boolean;
};

export const discoveryDefaults: DiscoveryPreferenceValues = { interestedIn: ['woman', 'man', 'nonbinary'], minAge: 18, maxAge: 45, distance: 50 };

export function DiscoveryPreferences({ interestedIn, minAge, maxAge, distance, onChange, errors = {}, showPresets = false }: Props) {
  const { theme, t } = useBinderTheme();
  const current = { interestedIn, minAge, maxAge, distance };
  return (
    <View style={{ gap: theme.spacing.x10 }}>
      {showPresets ? <PreferenceGroup title={t('discoveryPreferences.groups.preset')}>
        <View style={{ gap: theme.spacing.x2 }}>
          {discoveryPresets.map((preset) => <BinderChip key={preset.id} multiline label={`${t(preset.labelKey)} · ${t(preset.descriptionKey)}`} selected={matchingDiscoveryPreset(current) === preset.id} onPress={() => onChange({ ...current, minAge: preset.minAge, maxAge: preset.maxAge, distance: preset.distance })} />)}
        </View>
      </PreferenceGroup> : null}
      <PreferenceGroup title={t('discoveryPreferences.groups.audience')} error={errors.audience}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          {GENDERS.map((item) => <BinderChip key={item.value} label={t(item.labelKey)} selected={interestedIn.includes(item.value)} onPress={() => onChange({ ...current, interestedIn: interestedIn.includes(item.value) ? interestedIn.filter((value) => value !== item.value) : [...interestedIn, item.value] })} />)}
        </View>
      </PreferenceGroup>
      <PreferenceGroup title={t('discoveryPreferences.groups.age')} error={errors.age}>
        <BinderDial mode="range" steps={ageSteps} lowValue={minAge} highValue={maxAge} minimumSpan={1} lowAccessibilityLabel={t('discoveryPreferences.accessibility.minimumAge')} highAccessibilityLabel={t('discoveryPreferences.accessibility.maximumAge')} caption={t('discoveryPreferences.units.years')} onChange={(low, high) => onChange({ ...current, minAge: low, maxAge: high })} />
      </PreferenceGroup>
      <PreferenceGroup title={t('discoveryPreferences.groups.distance')} error={errors.distance}>
        <BinderDial mode="single" steps={radiusSteps} value={distance} accessibilityLabel={t('discoveryPreferences.accessibility.searchRadius')} caption={t('discoveryPreferences.units.km')} onChange={(value) => onChange({ ...current, distance: value })} />
      </PreferenceGroup>
    </View>
  );
}

function PreferenceGroup({ title, error, children }: { title: string; error?: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <View><BinderText variant="title" style={{ marginBottom: theme.spacing.x4 }}>{title}</BinderText>{children}{error ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x3 }}>{error}</BinderText> : null}</View>;
}
