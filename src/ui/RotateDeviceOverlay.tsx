import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { isMobileDevice } from '@/game/isMobileDevice';

/** Mobile only: this game is landscape-only — nudge the player to rotate rather than letting the
 * whole HUD get cramped into a tall, narrow portrait layout. */
export default function RotateDeviceOverlay() {
  const { width, height } = useWindowDimensions();
  if (!isMobileDevice() || width >= height) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>📱↻</Text>
      <Text style={styles.text}>Tourne ton téléphone en mode paysage pour jouer</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0c0f16',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 32,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  text: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
