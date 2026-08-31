import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useGameStore } from '@/store/gameStore';

/** Desktop web: Shift toggles sound on/off, same as the sound button. Sound is on by default. */
export function useMuteKey() {
  const toggleMuted = useGameStore((s) => s.toggleMuted);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight' && e.key !== 'Shift') return;
      toggleMuted();
    };
    window.addEventListener('keydown', handleDown, true);
    return () => window.removeEventListener('keydown', handleDown, true);
  }, [toggleMuted]);
}
