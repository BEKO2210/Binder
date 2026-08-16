import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { GENDERS, type Gender } from '../lib/validation';
import { supabase } from '../lib/supabase';
import { useBinderTheme } from '../theme/ThemeProvider';
import { RangeSlider, SingleSlider } from './RangeSlider';
import { BinderButton, BinderCard, BinderChip, BinderIconButton, BinderText, ScreenState } from './ui';

type Props = { onClose: () => void; onApplied: () => void };

type LoadedProfile = {
  first_name: string;
  gender: Gender;
  bio: string;
  interests: string[];
};

// Quick discovery preferences straight from the deck: sliders instead of
// number inputs, saved through the same server RPC the profile settings use.
export default function DiscoveryFilterSheet({ onClose, onApplied }: Props) {
  const { theme } = useBinderTheme();
  const [profile, setProfile] = useState<LoadedProfile | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(45);
  const [distance, setDistance] = useState(50);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { if (active) setError('Authentication required.'); return; }
      const [profileResult, preferencesResult] = await Promise.all([
        supabase.from('profiles').select('first_name,gender,bio,interests').eq('user_id', uid).single(),
        supabase.from('user_preferences').select('interested_in,min_age,max_age,max_distance_km').eq('user_id', uid).single(),
      ]);
      if (!active) return;
      if (profileResult.error || preferencesResult.error) {
        setError('Could not load your discovery settings.');
        return;
      }
      setProfile(profileResult.data as LoadedProfile);
      setInterestedIn(preferencesResult.data.interested_in as Gender[]);
      setMinAge(preferencesResult.data.min_age);
      setMaxAge(preferencesResult.data.max_age);
      setDistance(preferencesResult.data.max_distance_km);
    }
    void load().catch(() => { if (active) setError('Could not load your discovery settings.'); });
    return () => { active = false; };
  }, []);

  async function apply() {
    if (!profile || busy) return;
    if (interestedIn.length === 0) { setError('Choose at least one option under “I want to meet”.'); return; }
    setBusy(true);
    setError('');
    try {
      const { error: saveError } = await supabase.rpc('update_my_profile', {
        p_first_name: profile.first_name,
        p_gender: profile.gender,
        p_bio: profile.bio,
        p_interests: profile.interests,
        p_interested_in: interestedIn,
        p_min_age: minAge,
        p_max_age: maxAge,
        p_max_distance_km: distance,
      });
      if (saveError) throw saveError;
      onApplied();
    } catch {
      setError('Could not save your filters. Try again.');
      setBusy(false);
    }
  }

  return (
    <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}>
      <BinderCard style={{ maxHeight: '88%', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: theme.colors.borderStrong }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
          <View style={{ flex: 1 }}>
            <BinderText variant="micro" tone="accent">DISCOVERY FILTERS</BinderText>
            <BinderText variant="heading" style={{ marginTop: theme.spacing.x1 }}>Who fits both sides?</BinderText>
          </View>
          <BinderIconButton name="close" accessibilityLabel="Close discovery filters" onPress={onClose} />
        </View>

        {error && !profile ? (
          <ScreenState kind="error" icon="retry" title="Filters did not load" message={error} actionLabel="Close" onAction={onClose} />
        ) : !profile ? (
          <ScreenState kind="loading" message="Loading your filters…" />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: theme.spacing.x5, gap: theme.spacing.x6 }}>
            <View>
              <BinderText variant="micro" tone="muted" style={{ marginBottom: theme.spacing.x3 }}>I WANT TO MEET</BinderText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2 }}>
                {GENDERS.map((item) => (
                  <BinderChip
                    key={item.value}
                    label={item.label}
                    selected={interestedIn.includes(item.value)}
                    onPress={() => setInterestedIn((current) => current.includes(item.value) ? current.filter((value) => value !== item.value) : [...current, item.value])}
                  />
                ))}
              </View>
            </View>
            <RangeSlider
              min={18}
              max={100}
              lowValue={minAge}
              highValue={maxAge}
              label={(lowest, highest) => `Age ${lowest} – ${highest}`}
              onChange={(lowest, highest) => { setMinAge(lowest); setMaxAge(highest); }}
            />
            <SingleSlider
              min={1}
              max={500}
              value={distance}
              label={(value) => `Distance up to ${value} km`}
              onChange={setDistance}
            />
            {error ? <BinderText variant="caption" tone="destructive">{error}</BinderText> : null}
            <BinderButton label="Apply filters" loading={busy} onPress={() => void apply()} />
          </ScrollView>
        )}
      </BinderCard>
    </View>
  );
}
