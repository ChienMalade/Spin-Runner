import { Platform } from 'react-native';

/** True on native mobile builds, and on web when the browser reports a touch-primary (coarse)
 * pointer — i.e. an actual phone/tablet, not a desktop browser window. */
export function isMobileDevice(): boolean {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}
