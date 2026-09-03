import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { hslToHex } from '@/game/color';
import { GROWTH_LEVEL_MAX } from '@/net/protocol';
import { HUD_TOP } from '@/ui/hudLayout';

const MEDALS = ['🥇', '🥈', '🥉'];
const RANK_STRIPE = ['#ffd76a', '#c7d2e0', '#e0a458'];
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
      <View style={styles.panel}>
        <Text style={styles.header}>🏆 Classement</Text>
        {leaderboard.map((entry, i) => {
          const dotSize = dotSizeFor(entry.growthTier);
          return (
            <View key={entry.id} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={[styles.rankStripe, { backgroundColor: RANK_STRIPE[i] ?? 'rgba(255,255,255,0.2)' }]} />
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
              {i === 0 && <Text style={styles.timer}>{top1Seconds.toFixed(0)}s</Text>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: HUD_TOP,
    right: 64,
    width: 230,
  },
  panel: {
    backgroundColor: 'rgba(8,12,20,0.68)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  header: {
    color: 'rgba(180,215,255,0.75)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 8,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  rankStripe: { position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, borderRadius: 2 },
  medal: { fontSize: 16, marginRight: 5 },
  dot: { marginRight: 8 },
  name: { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  timer: { color: '#ffd76a', fontSize: 12, fontWeight: '800', marginLeft: 6 },
});
