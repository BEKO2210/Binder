import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { signedUrlsAreStale } from './signedUrlLifetime';

// The rule for a screen holding links that expire. The numbers themselves live
// in signedUrlLifetime.ts, which stays free of React Native so node:test can
// read them.

/**
 * Fetches again when the app comes back and the links it is holding have gone
 * off — and only then. Coming back after a minute must not re-run every
 * request on the screen.
 *
 * The reload is kept in a ref, so a screen does not have to hand over a stable
 * callback to get this right.
 */
export function useFreshSignedMedia(reload: () => void): void {
  const latest = useRef(reload);
  latest.current = reload;
  const loadedAt = useRef(Date.now());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (!signedUrlsAreStale(loadedAt.current, now)) return;
      loadedAt.current = now;
      latest.current();
    });
    return () => subscription.remove();
  }, []);
}
