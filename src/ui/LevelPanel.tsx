import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { GROWTH_LEVEL_MAX, LEVEL_MAX, MAX_SWORDS, SPIN_LEVEL_MAX } from '@/net/protocol';
import { HUD_PANEL_HEIGHT, HUD_TOP, HUD_SIDE_MARGIN, LEVEL_PANEL_WIDTH } from '@/ui/hudLayout';

/** One column: icon over a number over a thin bar. Narrow so several sit side by side and the panel
 * keeps the same height as the gauges next to it. */
function Column({
  icon,
  value,
  frac,
  maxed,
}: {
  icon: string;
  value: number;
  frac: number;
  maxed: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.levelText}>{value}</Text>
      <View style={styles.miniTrack}>
        <View
          style={[
            styles.miniFill,
            { width: `${Math.max(0, Math.min(1, frac)) * 100}%`, backgroundColor: maxed ? '#ffd76a' : '#38bdf8' },
          ]}
        />
      </View>
    </View>
  );
}

/** A level with its progress toward the next one. */
function Stat({
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
  const frac = maxed ? 1 : progress / Math.max(1, needed);
  return <Column icon={icon} value={Math.min(level, levelMax)} frac={frac} maxed={maxed} />;
}

export default function LevelPanel() {
  const playerId = useGameStore((s) => s.playerId);
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  if (!player) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.panel}>
        <View style={styles.row}>
          <Stat icon="👻" level={player.growthTier} progress={player.growthProgress} levelMax={GROWTH_LEVEL_MAX} />
          <Stat icon="🌀" level={player.spinLevel} progress={player.spinProgress} levelMax={SPIN_LEVEL_MAX} />
          <Stat icon="⭐" level={player.swordTier} progress={player.swordTierProgress} levelMax={LEVEL_MAX} />
          {/* How many blades are currently in the ring — a count out of the cap, not a level. */}
          <Column
            icon="🗡️"
            value={player.swords.length}
            frac={player.swords.length / MAX_SWORDS}
            maxed={player.swords.length >= MAX_SWORDS}
          />
        </View>
        {player.gold > 0 && <Text style={styles.goldText}>🪙 {player.gold}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: HUD_TOP, left: HUD_SIDE_MARGIN, width: LEVEL_PANEL_WIDTH },
  panel: {
    height: HUD_PANEL_HEIGHT,
    backgroundColor: 'rgba(8,12,20,0.68)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 2 },
  icon: { fontSize: 15 },
  levelText: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 1 },
  miniTrack: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    marginTop: 3,
  },
  miniFill: { height: '100%' },
  goldText: { color: '#ffd76a', fontSize: 11, fontWeight: '800', textAlign: 'center', marginTop: 3 },
});
