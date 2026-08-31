import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { hslToHex } from '@/game/color';
import { GROWTH_LEVEL_MAX } from '@/net/protocol';

const MEDALS = ['🥇', '🥈', '🥉'];
const DOT_MIN = 12;
const DOT_MAX = 26;

function dotSizeFor(growthTier: number): number {
  const frac = (growthTier - 1) / Math.max(1, GROWTH_LEVEL_MAX - 1);
  return DOT_MIN + frac * (DOT_MAX - DOT_MIN);
}

export default function Leaderboard() {
  const leaderboard = useGameStore((s) => s.leaderboard);
  const top1Since = useGameStore((s) => s.top1Since);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  if (leaderboard.length === 0) return null;
  const top1Seconds = top1Since > 0 ? Math.max(0, (Date.now() - top1Since) / 1000) : 0;

  return (
    <View style={styles.wrap} pointerEvents="none">
      {leaderboard.map((entry, i) => {
        const dotSize = dotSizeFor(entry.growthTier);
        return (
          <View key={entry.id} style={styles.row}>
            <Text style={styles.medal}>{MEDALS[i]}</Text>
            <View
              style={[
                styles.dot,
                {
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: hslToHex(entry.hue, 0.65, 0.55),
                },
              ]}
            />
            <Text style={styles.name} numberOfLines={1}>
              {entry.name}
            </Text>
            <Text style={styles.tier}>Palier {entry.growthTier}</Text>
            {i === 0 && <Text style={styles.timer}>{top1Seconds.toFixed(0)}s</Text>}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 48,
    right: 64,
    width: 230,
    gap: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  medal: { fontSize: 16, marginRight: 5 },
  dot: { marginRight: 8 },
  name: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  tier: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  timer: { color: '#ffd76a', fontSize: 12, fontWeight: '800', marginLeft: 6 },
});
