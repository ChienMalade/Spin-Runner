import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { isMobileDevice } from '@/game/isMobileDevice';

/** Mobile only: a discrete dash/sprint button on the right, mirroring the joystick's presence on
 * the left at a comfortable distance from it and from the arena-code badge below. */
export default function SprintButton() {
  const updateInput = useGameStore((s) => s.updateInput);
  const mobile = useRef(isMobileDevice()).current;
  const [pressed, setPressed] = useState(false);
  if (!mobile) return null;

  return (
    <Pressable
      style={[styles.button, pressed && styles.pressed]}
      onPressIn={() => {
        setPressed(true);
        updateInput({ sprint: true });
      }}
      onPressOut={() => {
        setPressed(false);
        updateInput({ sprint: false });
      }}
    >
      <Text style={styles.icon}>⚡</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 30,
    bottom: 100,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.28)', borderColor: 'rgba(255,255,255,0.55)' },
  icon: { fontSize: 34 },
});
