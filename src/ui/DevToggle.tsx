import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useGameStore } from '@/store/gameStore';

/** A little easter egg: the dev-mode button only shows up if you named yourself "dev" (any case)
 * in the lobby — not meant to be a real access gate, just kept out of everyone else's way. */
export default function DevToggle() {
  const devMode = useGameStore((s) => s.devMode);
  const toggleDevMode = useGameStore((s) => s.toggleDevMode);
  const playerId = useGameStore((s) => s.playerId);
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));

  if (player?.name.toLowerCase() !== 'dev') return null;

  return (
    <Pressable style={[styles.button, devMode && styles.active]} onPress={toggleDevMode}>
      <Text style={styles.icon}>💻</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    top: 140,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.25)' },
  icon: { fontSize: 16 },
});
