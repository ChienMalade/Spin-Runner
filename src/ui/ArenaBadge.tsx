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
      <Text style={styles.label}>🌐 Arène</Text>
      <Text style={styles.code}>{arenaCode}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: 'rgba(8,12,20,0.7)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  label: {
    color: 'rgba(180,215,255,0.7)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  code: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 3 },
});
