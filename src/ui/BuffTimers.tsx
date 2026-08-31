import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';

export default function BuffTimers() {
  const playerId = useGameStore((s) => s.playerId);
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  if (!player) return null;
  const now = Date.now();
  const shieldRemaining = Math.max(0, player.shieldUntil - now) / 1000;
  const speedRemaining = Math.max(0, player.speedBuffUntil - now) / 1000;
  if (shieldRemaining <= 0 && speedRemaining <= 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      {shieldRemaining > 0 && (
        <View style={styles.badge}>
          <Text style={styles.icon}>🛡️</Text>
          <Text style={styles.time}>{shieldRemaining.toFixed(1)}s</Text>
        </View>
      )}
      {speedRemaining > 0 && (
        <View style={styles.badge}>
          <Text style={styles.icon}>👟</Text>
          <Text style={styles.time}>x2 · {speedRemaining.toFixed(1)}s</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 96, left: 20, flexDirection: 'row', gap: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  icon: { fontSize: 20, marginRight: 6 },
  time: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
