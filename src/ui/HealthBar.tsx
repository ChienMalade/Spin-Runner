import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { HP_PER_GROWTH_LEVEL } from '@/net/protocol';

/** Thin divider lines marking each notch boundary inside a bar — `count` is how many segments the
 * bar is currently divided into (so `count - 1` visible lines). */
function Graduations({ count }: { count: number }) {
  if (count <= 1) return null;
  const lines = [];
  for (let i = 1; i < count; i++) {
    lines.push(<View key={i} style={[styles.tick, { left: `${(i / count) * 100}%` }]} />);
  }
  return <>{lines}</>;
}

const FLASH_MS = 260;

export default function HealthBar() {
  const playerId = useGameStore((s) => s.playerId);
  const player = useGameStore((s) => s.players.find((p) => p.id === playerId));
  const rafRef = useRef<number | null>(null);
  const [, setFrame] = useState(0);

  // Per-segment "cool effect" flashes: a quick bright pop when a charge is gained, a quick white
  // burst revealing the blue underneath when one is spent — keyed by segment index.
  const gainFlashRef = useRef<Map<number, number>>(new Map());
  const drainFlashRef = useRef<Map<number, number>>(new Map());
  const prevChargesRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = () => {
      setFrame((f) => f + 1);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (!player) return null;
  const now = Date.now();
  const hpFrac = Math.max(0, player.hp / player.maxHp);
  const hpNotches = Math.max(1, Math.round(player.maxHp / HP_PER_GROWTH_LEVEL));

  const maxDash = Math.max(1, player.maxDashCharges);
  const dashCharges = player.dashCharges;
  const staminaFrac = Math.max(0, Math.min(1, player.stamina));

  if (prevChargesRef.current != null && prevChargesRef.current !== dashCharges) {
    if (dashCharges > prevChargesRef.current) {
      gainFlashRef.current.set(dashCharges - 1, now);
    } else {
      drainFlashRef.current.set(dashCharges, now);
    }
  }
  prevChargesRef.current = dashCharges;

  // Truly exhausted: no banked charges left AND nothing currently progressing — slow blink on the
  // bare track to say "hang tight, it'll start filling again soon".
  const exhausted = dashCharges === 0 && player.stamina <= 0;
  const exhaustedBlinkOn = exhausted && Math.floor(now / 300) % 2 === 0;

  // Same oscillation speed for the ready-dash pulse and the shield blink below, so the two read as
  // one consistent "pulsing" language instead of two different rhythms.
  const PULSE_PERIOD_MS = 140;
  const pulsePhase = 0.5 + 0.5 * Math.sin(now / PULSE_PERIOD_MS);

  // A ready dash slot keeps pulsing (not just a one-off flash) until it's actually spent, so it
  // stays visibly "waiting to be used".
  const readyPulse = 0.35 + 0.35 * pulsePhase;

  const shielded = player.shieldUntil > now;
  // Strong blink for as long as the invulnerability lasts — meant to read as "powerful".
  const shieldBlink = shielded ? 0.25 + 0.55 * pulsePhase : 0;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${hpFrac * 100}%`, backgroundColor: '#ff5d73' }]} />
        {shielded && (
          <View style={[styles.overlay, { opacity: shieldBlink, backgroundColor: '#bfe9ff' }]} />
        )}
        <Graduations count={hpNotches} />
      </View>
      <View style={[styles.track, styles.staminaTrack]}>
        {Array.from({ length: maxDash }).map((_, i) => {
          const ready = i < dashCharges;
          const charging = i === dashCharges;
          const segFrac = ready ? 1 : charging ? staminaFrac : 0;

          const gainAt = gainFlashRef.current.get(i);
          const gainAge = gainAt != null ? now - gainAt : Infinity;
          const drainAt = drainFlashRef.current.get(i);
          const drainAge = drainAt != null ? now - drainAt : Infinity;

          return (
            <View key={i} style={[styles.segment, { left: `${(i / maxDash) * 100}%`, width: `${100 / maxDash}%` }]}>
              <View style={[styles.segFill, { width: `${segFrac * 100}%`, backgroundColor: '#2fb8ff' }]} />
              {ready && <View style={[styles.overlay, { opacity: readyPulse, backgroundColor: '#ffffff' }]} />}
              {gainAge < FLASH_MS && (
                <View style={[styles.overlay, { opacity: 1 - gainAge / FLASH_MS, backgroundColor: '#ffffff' }]} />
              )}
              {drainAge < FLASH_MS && (
                <View style={[styles.overlay, { opacity: 1 - drainAge / FLASH_MS, backgroundColor: '#ffffff' }]} />
              )}
              {exhausted && exhaustedBlinkOn && (
                <View style={[styles.overlay, { backgroundColor: 'rgba(255,255,255,0.22)' }]} />
              )}
            </View>
          );
        })}
        <Graduations count={maxDash} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 48, left: 20, right: 286 },
  track: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  staminaTrack: { height: 7, marginTop: 4 },
  fill: { height: '100%' },
  segment: { position: 'absolute', top: 0, height: '100%' },
  segFill: { height: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  tick: { position: 'absolute', top: 0, width: 1, height: '100%', backgroundColor: 'rgba(0,0,0,0.35)' },
});
