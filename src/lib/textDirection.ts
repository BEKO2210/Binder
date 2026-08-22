import { I18nManager } from 'react-native';
import * as Updates from 'expo-updates';

import { isRightToLeft, needsDirectionRestart } from '../i18n/direction';
import type { LocaleCode } from '../i18n/registry';

// The one place that talks to the native side about direction. The decision
// itself lives in `src/i18n/direction.ts` and is tested there.

// Android disallows right-to-left layout unless the app says otherwise, and it
// has to be said before anything is measured — so, at import.
I18nManager.allowRTL(true);

export function layoutIsRightToLeft(): boolean {
  return I18nManager.isRTL;
}

/**
 * Puts the layout the way the language reads, and starts the app again if that
 * is not the way it already is.
 *
 * `forceRTL` is written to native settings and takes effect on the next start:
 * nothing already rendered moves. So the app reloads itself, once, and only on
 * a real disagreement — anything else is a restart loop on every launch.
 *
 * A reload can fail (a development client without the updates module, a
 * device refusing it). The interface stays readable either way, just laid out
 * the old way until the person opens the app again, which is a far smaller
 * problem than an app that cannot finish starting.
 */
export async function applyTextDirection(locale: LocaleCode): Promise<boolean> {
  const wanted = isRightToLeft(locale);
  I18nManager.allowRTL(true);
  if (!needsDirectionRestart(locale, I18nManager.isRTL)) {
    I18nManager.forceRTL(wanted);
    return false;
  }
  I18nManager.forceRTL(wanted);
  try {
    await Updates.reloadAsync();
  } catch {
    return false;
  }
  return true;
}
