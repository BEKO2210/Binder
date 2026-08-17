import { View } from 'react-native';

import { radiusSteps } from '../lib/dialScale';
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
};

export const discoveryDefaults: DiscoveryPreferenceValues = { interestedIn: ['woman', 'man', 'nonbinary'], minAge: 18, maxAge: 45, distance: 50 };

export function DiscoveryPreferences({ interestedIn, minAge, maxAge, distance, onChange, errors = {} }: Props) {
  const { theme } = useBinderTheme();
  const current = { interestedIn, minAge, maxAge, distance };
  return (
    <View style={{ gap: theme.spacing.x10 }}>
      <PreferenceGroup title="Who I want to meet" error={errors.audience}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
          {GENDERS.map((item) => <BinderChip key={item.value} label={item.label} selected={interestedIn.includes(item.value)} onPress={() => onChange({ ...current, interestedIn: interestedIn.includes(item.value) ? interestedIn.filter((value) => value !== item.value) : [...interestedIn, item.value] })} />)}
        </View>
      </PreferenceGroup>
      <PreferenceGroup title="Age" error={errors.age}>
        <BinderDial mode="range" steps={ageSteps} lowValue={minAge} highValue={maxAge} minimumSpan={1} lowAccessibilityLabel="Minimum age" highAccessibilityLabel="Maximum age" caption="years" onChange={(low, high) => onChange({ ...current, minAge: low, maxAge: high })} />
      </PreferenceGroup>
      <PreferenceGroup title="Distance" error={errors.distance}>
        <BinderDial mode="single" steps={radiusSteps} value={distance} accessibilityLabel="Search radius" caption="km" onChange={(value) => onChange({ ...current, distance: value })} />
      </PreferenceGroup>
    </View>
  );
}

function PreferenceGroup({ title, error, children }: { title: string; error?: string; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return <View><BinderText variant="title" style={{ marginBottom: theme.spacing.x4 }}>{title}</BinderText>{children}{error ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x3 }}>{error}</BinderText> : null}</View>;
}
