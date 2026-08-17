import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { supabase } from '../lib/supabase';
import { announce } from '../lib/announce';
import { loadDiscoveryPreferences } from '../lib/discovery';
import { discoveryCountDebounceMs, likelyEmptyFilter } from '../lib/discoveryPreferencesPolicy';
import { formatCount } from '../lib/format';
import type { Gender } from '../lib/validation';
import { useBinderTheme } from '../theme/ThemeProvider';
import { DiscoveryPreferences, discoveryDefaults, type DiscoveryPreferenceValues } from './DiscoveryPreferences';
import { BinderButton, BinderCard, BinderIconButton, BinderScreenHeader, BinderText, ScreenState } from './ui';

type Props = { initialValues: DiscoveryPreferenceValues | null; onClose: () => void; onApplied: (values: DiscoveryPreferenceValues) => void };
type LoadedProfile = { first_name: string; gender: Gender; bio: string; interests: string[] };
type GroupErrors = { audience?: string; age?: string; distance?: string };

export default function DiscoveryFilterSheet({ initialValues, onClose, onApplied }: Props) {
  const { theme, reduceMotion, t } = useBinderTheme();
  const [profile, setProfile] = useState<LoadedProfile | null>(null);
  const [viewerId, setViewerId] = useState('');
  const [values, setValues] = useState(initialValues ?? discoveryDefaults);
  const [loadError, setLoadError] = useState('');
  const [errors, setErrors] = useState<GroupErrors>({});
  const [busy, setBusy] = useState(false);
  const [passingCount, setPassingCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [countBusy, setCountBusy] = useState(false);
  const countRequest = useRef(0);
  // A failed load used to leave only "Close": the user had to dismiss the sheet
  // and open it again to retry the very same request.
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError('');
    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error(t('discoveryFilterSheet.errors.authentication'));
      const [profileResult, preferencesResult] = await Promise.all([
        supabase.from('profiles').select('first_name,gender,bio,interests').eq('user_id', uid).single(),
        initialValues ? Promise.resolve(null) : loadDiscoveryPreferences(),
      ]);
      if (profileResult.error) throw new Error(t('discoveryFilterSheet.errors.load'));
      if (!active) return;
      setViewerId(uid);
      setProfile(profileResult.data as LoadedProfile);
      if (preferencesResult) setValues(preferencesResult);
    }
    void load().catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : t('discoveryFilterSheet.errors.load')); });
    return () => { active = false; };
  }, [initialValues, loadAttempt]);

  useEffect(() => {
    if (!profile || !viewerId) return;
    const request = ++countRequest.current;
    const controller = new AbortController();
    setCountBusy(true);
    const timer = setTimeout(() => {
      // The count comes from the server with the same rules discovery applies —
      // age, distance, blocks, decisions, suspensions and legal state included.
      // Counting profiles by gender in the client claimed a consequence the
      // dial did not actually have.
      void supabase.rpc('count_discovery_candidates', {
        p_interested_in: values.interestedIn,
        p_min_age: values.minAge,
        p_max_age: values.maxAge,
        p_distance_km: values.distance,
      })
        .abortSignal(controller.signal)
        .then(({ data, error }) => {
          if (request !== countRequest.current || controller.signal.aborted) return;
          setCountBusy(false);
          if (error) {
            // A stale number is worse than an honest gap: it would keep
            // promising a consequence the server never confirmed.
            setPassingCount(null);
            setCountError(true);
            return;
          }
          setCountError(false);
          setPassingCount(typeof data === 'number' ? data : 0);
        });
    }, discoveryCountDebounceMs);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [profile, values, viewerId]);

  async function apply() {
    if (!profile || busy) return;
    const nextErrors: GroupErrors = {};
    if (values.interestedIn.length === 0) nextErrors.audience = t('discoveryFilterSheet.errors.audience');
    if (values.minAge < 18 || values.maxAge > 100 || values.minAge >= values.maxAge) nextErrors.age = t('discoveryFilterSheet.errors.age');
    if (values.distance < 1 || values.distance > 500) nextErrors.distance = t('discoveryFilterSheet.errors.distance');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc('update_my_profile', { p_first_name: profile.first_name, p_gender: profile.gender, p_bio: profile.bio, p_interests: profile.interests, p_interested_in: values.interestedIn, p_min_age: values.minAge, p_max_age: values.maxAge, p_max_distance_km: values.distance });
      if (error) throw error;
      announce(t('discoveryFilterSheet.accessibility.filtersApplied'));
      onApplied(values);
    } catch {
      setErrors({ distance: t('discoveryFilterSheet.errors.save') });
      setBusy(false);
    }
  }

  return (
    <Animated.View entering={reduceMotion ? undefined : SlideInDown.duration(theme.motion.deliberate)} exiting={reduceMotion ? undefined : SlideOutDown.duration(theme.motion.deliberate)} style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.overlay, justifyContent: 'flex-end' }}>
      <BinderCard style={{ height: '94%', padding: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderColor: theme.colors.borderStrong, overflow: 'hidden' }}>
        <View style={{ alignItems: 'center', paddingTop: theme.spacing.x2 }}><View style={{ width: theme.spacing.x10, height: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: theme.colors.borderStrong }} /></View>
        <BinderScreenHeader title={t('discoveryFilterSheet.header.title')} eyebrow={t('discoveryFilterSheet.header.eyebrow')} trailing={<BinderIconButton name="close" accessibilityLabel={t('discoveryFilterSheet.accessibility.close')} onPress={onClose} />} />
        {loadError ? <ScreenState kind="error" icon="retry" title={t('discoveryFilterSheet.states.loadErrorTitle')} message={loadError} actionLabel={t('discoveryFilterSheet.actions.tryAgain')} onAction={() => setLoadAttempt((value) => value + 1)} secondaryActionLabel={t('discoveryFilterSheet.actions.close')} onSecondaryAction={onClose} /> : !profile ? <ScreenState kind="loading" message={t('discoveryFilterSheet.states.loading')} /> : (
          <>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: theme.spacing.x5, paddingTop: theme.spacing.x4, paddingBottom: theme.spacing.x8 }}>
              <DiscoveryPreferences {...values} showPresets onChange={(next) => { setValues(next); setErrors({}); }} errors={errors} />
              <CountConsequence count={passingCount} loading={countBusy} failed={countError} cause={likelyEmptyFilter(values)} />
            </ScrollView>
            <View style={{ paddingHorizontal: theme.spacing.x5, paddingTop: theme.spacing.x3, paddingBottom: theme.spacing.x5, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>
              <BinderButton label={t('discoveryFilterSheet.actions.apply')} loading={busy} onPress={() => void apply()} />
              <BinderButton label={t('discoveryFilterSheet.actions.reset')} variant="ghost" disabled={busy} onPress={() => { setValues(discoveryDefaults); setErrors({}); }} style={{ marginTop: theme.spacing.x2 }} />
            </View>
          </>
        )}
      </BinderCard>
    </Animated.View>
  );
}

function CountConsequence({ count, loading, failed, cause }: { count: number | null; loading: boolean; failed: boolean; cause: 'audience' | 'age' | 'distance' }) {
  const { theme, locale, t } = useBinderTheme();
  const causeCopy = cause === 'audience' ? t('discoveryFilterSheet.count.causes.audience') : cause === 'age' ? t('discoveryFilterSheet.count.causes.age') : t('discoveryFilterSheet.count.causes.distance');
  return <View accessibilityLiveRegion="polite" style={{ marginTop: theme.spacing.x8 }}>
    <BinderText variant="title">{failed && !loading ? t('discoveryFilterSheet.count.unavailable') : loading || count === null ? t('discoveryFilterSheet.count.checking') : count === 0 ? t('discoveryFilterSheet.count.none') : t(count === 1 ? 'discoveryFilterSheet.count.personOne' : 'discoveryFilterSheet.count.personOther', { count: formatCount(count, locale) })}</BinderText>
    {failed && !loading ? <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('discoveryFilterSheet.count.failed')}</BinderText>
      : count === 0 && !loading ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x2 }}>{t('discoveryFilterSheet.count.likelyCause', { cause: causeCopy })}</BinderText>
      : <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('discoveryFilterSheet.count.updates')}</BinderText>}
  </View>;
}
