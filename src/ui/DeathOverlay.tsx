import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';

export default function DeathOverlay() {
  const dead = useGameStore((s) => s.dead);
  const retry = useGameStore((s) => s.retry);
  if (!dead) return null;

  return (
    <View style={styles.overlay}>
      <Text style={styles.title}>Vous êtes mort</Text>
      <Pressable style={styles.button} onPress={retry}>
        <Text style={styles.buttonText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,10,16,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '800', marginBottom: 24, letterSpacing: 1 },
  button: {
    backgroundColor: '#ff5d73',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700', letterSpacing: 1 },
});
