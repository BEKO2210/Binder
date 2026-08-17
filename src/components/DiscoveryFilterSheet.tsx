import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { supabase } from '../lib/supabase';
import type { Gender } from '../lib/validation';
import { useBinderTheme } from '../theme/ThemeProvider';
import { DiscoveryPreferences, discoveryDefaults, type DiscoveryPreferenceValues } from './DiscoveryPreferences';
import { BinderButton, BinderCard, BinderIconButton, BinderScreenHeader, ScreenState } from './ui';

type Props = { initialValues: DiscoveryPreferenceValues | null; onClose: () => void; onApplied: (values: DiscoveryPreferenceValues) => void };
type LoadedProfile = { first_name: string; gender: Gender; bio: string; interests: string[] };
type GroupErrors = { audience?: string; age?: string; distance?: string };

export default function DiscoveryFilterSheet({ initialValues, onClose, onApplied }: Props) {
  const { theme } = useBinderTheme();
  const [profile, setProfile] = useState<LoadedProfile | null>(null);
  const [values, setValues] = useState(initialValues ?? discoveryDefaults);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<GroupErrors>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error('Authentication required.');
      const [profileResult, preferencesResult] = await Promise.all([
        supabase.from('profiles').select('first_name,gender,bio,interests').eq('user_id', uid).single(),
        initialValues ? Promise.resolve(null) : supabase.from('user_preferences').select('interested_in,min_age,max_age,max_distance_km').eq('user_id', uid).single(),
      ]);
      if (profileResult.error || preferencesResult?.error) throw new Error('Could not load your discovery settings.');
      if (!active) return;
      setProfile(profileResult.data as LoadedProfile);
      if (preferencesResult?.data) setValues({ interestedIn: preferencesResult.data.interested_in as Gender[], minAge: preferencesResult.data.min_age, maxAge: preferencesResult.data.max_age, distance: preferencesResult.data.max_distance_km });
    }
    void load().catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Could not load your discovery settings.'); });
    return () => { active = false; };
  }, [initialValues]);

  async function apply() {
    if (!profile || busy) return;
    const nextErrors: GroupErrors = {};
    if (values.interestedIn.length === 0) nextErrors.audience = 'Choose at least one person you want to meet.';
    if (values.minAge < 18 || values.maxAge > 100 || values.minAge >= values.maxAge) nextErrors.age = 'Choose an age range of at least one year.';
    if (values.distance < 1 || values.distance > 500) nextErrors.distance = 'Choose a distance from 1 to 500 km.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('update_my_profile', { p_first_name: profile.first_name, p_gender: profile.gender, p_bio: profile.bio, p_interests: profile.interests, p_interested_in: values.interestedIn, p_min_age: values.minAge, p_max_age: values.maxAge, p_max_distance_km: values.distance });
      if (error) throw error;
      onApplied(values);
    } catch {
      setErrors({ distance: 'Binder could not save these filters. Check your connection and try again.' });
      setBusy(false);
    }
  }

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}>
      <BinderCard style={{ height: '94%', padding: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: theme.colors.borderStrong, overflow: 'hidden' }}>
        <View style={{ alignItems: 'center', paddingTop: theme.spacing.x2 }}><View style={{ width: theme.spacing.x10, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: theme.colors.borderStrong }} /></View>
        <BinderScreenHeader title="Your search" eyebrow="DISCOVERY" trailing={<BinderIconButton name="close" accessibilityLabel="Close discovery filters" onPress={onClose} />} />
        {loadError ? <ScreenState kind="error" icon="retry" title="Filters did not load" message={loadError} actionLabel="Close" onAction={onClose} /> : !profile ? <ScreenState kind="loading" message="Loading your filters…" /> : (
          <>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.spacing.x5, paddingTop: theme.spacing.x4, paddingBottom: theme.spacing.x8 }}>
              <DiscoveryPreferences {...values} onChange={(next) => { setValues(next); setErrors({}); }} errors={errors} />
            </ScrollView>
            <View style={{ paddingHorizontal: theme.spacing.x5, paddingTop: theme.spacing.x3, paddingBottom: theme.spacing.x5, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>
              <BinderButton label="Apply filters" loading={busy} onPress={() => void apply()} />
              <BinderButton label="Reset to defaults" variant="ghost" disabled={busy} onPress={() => { setValues(discoveryDefaults); setErrors({}); }} style={{ marginTop: theme.spacing.x2 }} />
            </View>
          </>
        )}
      </BinderCard>
    </View>
  );
}
