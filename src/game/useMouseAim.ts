import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { isMobileDevice } from '@/game/isMobileDevice';

/** Desktop web: the player steers toward the mouse cursor, relative to the screen center — the
 * camera always keeps the local player centered, so screen center doubles as the player's position.
 * On mobile the joystick is the sole movement control, so this never attaches there. */
export function useMouseAim() {
  const updateInput = useGameStore((s) => s.updateInput);

  useEffect(() => {
    if (Platform.OS !== 'web' || isMobileDevice()) return;
    const handleMove = (e: MouseEvent) => {
      // Moving the mouse to click a HUD button (sound, dev panel, ...) shouldn't drag the
      // player's aim toward that corner of the screen — ignore aim updates while over the HUD.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-hud]')) return;

      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len < 8) {
        updateInput({ dx: 0, dy: 0 });
        return;
      }
      updateInput({ dx: dx / len, dy: dy / len });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [updateInput]);
}
