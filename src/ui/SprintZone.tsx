import React, { useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { isMobileDevice } from '@/game/isMobileDevice';

/** Mobile only: pressing anywhere on the right half of the screen sprints, leaving the left half
 * free for the joystick. Sits below the top HUD row so those buttons stay tappable. */
export default function SprintZone() {
  const updateInput = useGameStore((s) => s.updateInput);
  const mobile = useRef(isMobileDevice()).current;
  if (!mobile) return null;

  return (
    <Pressable
      style={styles.zone}
      onPressIn={() => updateInput({ sprint: true })}
      onPressOut={() => updateInput({ sprint: false })}
    />
  );
}

const styles = StyleSheet.create({
  zone: { position: 'absolute', top: 140, right: 0, bottom: 0, width: '50%' },
});
