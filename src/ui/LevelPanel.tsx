import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { GROWTH_LEVEL_MAX, LEVEL_MAX, SPIN_LEVEL_MAX } from '@/net/protocol';

function Row({
  icon,
  level,
  progress,
  levelMax,
}: {
  icon: string;
  level: number;
  progress: number;
  levelMax: number;
}) {
  const maxed = level >= levelMax;
  // Pickups needed to advance from `level` to `level + 1` — mirrors server/src/entities.ts's
  // pickupsToNextLevel: same pace through level 9, then flat at the 9→10 cost up to level 20.
  const needed = level < 10 ? level : 9;
  const frac = maxed ? 1 : Math.max(0, Math.min(1, progress / Math.max(1, needed)));
  return (
    <View style={styles.row}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.levelText}>Lvl {Math.min(level, levelMax)}</Text>
          <Text style={styles.progressText}>{maxed ? 'MAX' : `${progress}/${needed}`}</Text>
        </View>
        <View style={styles.miniTrack}>
          <View
            style={[styles.miniFill, { width: `${frac * 100}%`, backgroundColor: maxed ? '#ffd76a' : '#38bdf8' }]}
          />
        </View>
      </View>
    </View>
  );
}

export default function LevelPanel() {
  const playerId = useGameStore((s) => s.playerId);
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  if (!player) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.panel}>
        <Text style={styles.header}>Stats</Text>
        <Row icon="👻" level={player.growthTier} progress={player.growthProgress} levelMax={GROWTH_LEVEL_MAX} />
        <Row icon="🌀" level={player.spinLevel} progress={player.spinProgress} levelMax={SPIN_LEVEL_MAX} />
        <Row icon="⭐" level={player.swordTier} progress={player.swordTierProgress} levelMax={LEVEL_MAX} />
        {player.gold > 0 && (
          <View style={styles.row}>
            <Text style={styles.icon}>🪙</Text>
            <Text style={styles.goldText}>{player.gold}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 190, right: 64, width: 200 },
  panel: {
    backgroundColor: 'rgba(8,12,20,0.68)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    gap: 5,
  },
  header: {
    color: 'rgba(180,215,255,0.75)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  icon: { fontSize: 18, width: 20, textAlign: 'center' },
  levelText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  progressText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700' },
  miniTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    marginTop: 2,
  },
  miniFill: { height: '100%' },
  goldText: { color: '#ffd76a', fontSize: 14, fontWeight: '800' },
});
