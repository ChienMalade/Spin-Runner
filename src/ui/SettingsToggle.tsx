import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useGameStore } from '@/store/gameStore';

export default function SettingsToggle() {
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const toggleSettingsOpen = useGameStore((s) => s.toggleSettingsOpen);

  return (
    <Pressable style={[styles.button, settingsOpen && styles.active]} onPress={toggleSettingsOpen}>
      <Text style={styles.icon}>🛠️</Text>
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
