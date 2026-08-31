import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useGameStore } from '@/store/gameStore';

/** Desktop web: holding Space sprints. preventDefault stops the space bar from scrolling the page. */
export function useSprintKey() {
  const updateInput = useGameStore((s) => s.updateInput);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      updateInput({ sprint: true });
    };
    const handleUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      updateInput({ sprint: false });
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, [updateInput]);
}
