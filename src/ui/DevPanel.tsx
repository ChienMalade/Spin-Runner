import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useGameStore } from '@/store/gameStore';

const PANEL_TOP = 260;

// Hold-to-repeat: fires once immediately, then repeats, speeding up the longer the button is held.
const REPEAT_START_MS = 380;
const REPEAT_MIN_MS = 60;
const REPEAT_ACCEL_MS = 35; // shaved off the interval after each repeat, down to REPEAT_MIN_MS

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (delta: number) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const start = (delta: number) => {
    stop();
    onChange(delta);
    let interval = REPEAT_START_MS;
    const tick = () => {
      onChange(delta);
      interval = Math.max(REPEAT_MIN_MS, interval - REPEAT_ACCEL_MS);
      timerRef.current = setTimeout(tick, interval);
    };
    timerRef.current = setTimeout(tick, interval);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPressIn={() => start(-1)} onPressOut={stop}>
          <Text style={styles.stepBtnText}>-</Text>
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable style={styles.stepBtn} onPressIn={() => start(1)} onPressOut={stop}>
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DevPanel() {
  const devMode = useGameStore((s) => s.devMode);
  const playerId = useGameStore((s) => s.playerId);
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  const botCount = useGameStore((s) => s.players.filter((p) => p.isBot).length);
  const bonusDensityLevel = useGameStore((s) => s.bonusDensityLevel);
  const sendDevCommand = useGameStore((s) => s.sendDevCommand);
  const { height } = useWindowDimensions();

  if (!devMode || !player) return null;

  // On short (mobile landscape) screens the panel can't just run off the bottom — cap it and let
  // it scroll instead.
  const maxHeight = Math.max(140, height - PANEL_TOP - 16);

  return (
    <View style={[styles.wrap, { maxHeight }]}>
      <Text style={styles.title}>Dev</Text>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      <Stepper
        label="Épées"
        value={`${player.swords.length}`}
        onChange={(delta) => sendDevCommand({ kind: 'swordCount', delta })}
      />
      <Stepper
        label="Taille (palier)"
        value={`${player.growthTier}`}
        onChange={(delta) => sendDevCommand({ kind: 'growthLevel', delta })}
      />
      <Stepper
        label="Rotation (palier)"
        value={`${player.spinLevel}`}
        onChange={(delta) => sendDevCommand({ kind: 'spinLevel', delta })}
      />
      <Stepper
        label="Dashs empilés"
        value={`${player.dashCharges}/${player.maxDashCharges}`}
        onChange={(delta) => sendDevCommand({ kind: 'dashCharges', delta })}
      />
      <Stepper
        label="Vitesse de base"
        value={`${player.devMoveSpeedOffset}`}
        onChange={(delta) => sendDevCommand({ kind: 'moveSpeedOffset', delta })}
      />
      <Stepper
        label="Recharge énergie"
        value={`${player.devStaminaRechargeOffsetSec.toFixed(1)}s`}
        onChange={(delta) => sendDevCommand({ kind: 'staminaRecharge', delta })}
      />
      <Stepper label="Bots" value={`${botCount}`} onChange={(delta) => sendDevCommand({ kind: 'botCount', delta })} />
      <Stepper
        label="Densité bonus"
        value={`${bonusDensityLevel}/10`}
        onChange={(delta) => sendDevCommand({ kind: 'bonusDensity', delta })}
      />

      <Pressable style={styles.resetBtn} onPress={() => sendDevCommand({ kind: 'reset' })}>
        <Text style={styles.resetBtnText}>Réinitialiser</Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 260,
    right: 16,
    width: 220,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  scroll: { flexGrow: 0 },
  title: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  rowLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  stepValue: { color: '#fff', fontSize: 12, fontWeight: '700', minWidth: 34, textAlign: 'center' },
  resetBtn: {
    marginTop: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.35)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.6)',
  },
  resetBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
