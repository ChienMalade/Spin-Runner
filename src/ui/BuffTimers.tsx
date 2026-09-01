import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';

// Mirrors server/src/entities.ts SHIELD_DURATION_MS / SPEED_BUFF_DURATION_MS — the wire protocol
// only sends the `Until` timestamp, not the total duration, so these are hand-duplicated to draw
// the mini progress bars below. Keep in sync by hand if the server durations ever change.
const SHIELD_DURATION_MS = 5000;
const SPEED_BUFF_DURATION_MS = 3000;

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
        <View style={[styles.badge, styles.shieldBadge]}>
          <Text style={styles.icon}>🛡️</Text>
          <View style={styles.badgeBody}>
            <Text style={styles.time}>{shieldRemaining.toFixed(1)}s</Text>
            <View style={styles.miniTrack}>
              <View
                style={[
                  styles.miniFill,
                  { width: `${Math.min(100, (shieldRemaining * 1000 * 100) / SHIELD_DURATION_MS)}%`, backgroundColor: '#3b82f6' },
                ]}
              />
            </View>
          </View>
        </View>
      )}
      {speedRemaining > 0 && (
        <View style={[styles.badge, styles.speedBadge]}>
          <Text style={styles.icon}>👟</Text>
          <View style={styles.badgeBody}>
            <Text style={styles.time}>x2 · {speedRemaining.toFixed(1)}s</Text>
            <View style={styles.miniTrack}>
              <View
                style={[
                  styles.miniFill,
                  { width: `${Math.min(100, (speedRemaining * 1000 * 100) / SPEED_BUFF_DURATION_MS)}%`, backgroundColor: '#22c55e' },
                ]}
              />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 122, left: 20, flexDirection: 'row', gap: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,12,20,0.7)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    minWidth: 96,
  },
  shieldBadge: { borderColor: 'rgba(59,130,246,0.45)' },
  speedBadge: { borderColor: 'rgba(34,197,94,0.45)' },
  icon: { fontSize: 18, marginRight: 8 },
  badgeBody: { flex: 1 },
  time: { color: '#fff', fontSize: 14, fontWeight: '800' },
  miniTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    marginTop: 3,
  },
  miniFill: { height: '100%' },
});
