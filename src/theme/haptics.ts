import * as Haptics from 'expo-haptics';

import { useBinderTheme } from './ThemeProvider';

export type BinderHaptic = 'selection' | 'bind' | 'match' | 'warning' | 'destructive';

export function useBinderHaptics() {
  const { settings } = useBinderTheme();

  return async (kind: BinderHaptic) => {
    if (!settings.hapticsEnabled) return;
    try {
      if (kind === 'selection') {
        await Haptics.selectionAsync();
        return;
      }
      if (kind === 'bind') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        return;
      }
      if (kind === 'match') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      if (kind === 'warning') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Haptics are enhancement only. Product actions never depend on vibration support.
    }
  };
}
