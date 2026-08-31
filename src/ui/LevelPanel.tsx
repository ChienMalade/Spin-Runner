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
  return (
    <View style={styles.row}>
      <Text style={styles.icon}>{icon}</Text>
      <View>
        <Text style={styles.levelText}>Lvl {Math.min(level, levelMax)}</Text>
        {maxed ? (
          <Text style={styles.progressText}>Lvl Max</Text>
        ) : (
          <Text style={styles.progressText}>
            {progress}/{needed}
          </Text>
        )}
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
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 178, right: 64, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    minWidth: 90,
  },
  icon: { fontSize: 20, marginRight: 8 },
  levelText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  progressText: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '600' },
  goldText: { color: '#ffd76a', fontSize: 15, fontWeight: '800' },
});
