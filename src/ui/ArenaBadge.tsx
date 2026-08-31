import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';

/** Shows the current arena's join code so a player can read it out (or screenshot it) to invite a
 * friend — the code they'd type into the "Code d'arène" field in the lobby. */
export default function ArenaBadge() {
  const arenaCode = useGameStore((s) => s.arenaCode);
  if (!arenaCode) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text style={styles.label}>Arène</Text>
      <Text style={styles.code}>{arenaCode}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  label: { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  code: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 3 },
});
