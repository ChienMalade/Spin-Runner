import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';

const FLASH_DURATION_MS = 350;

export default function DamageFlash() {
  const playerId = useGameStore((s) => s.playerId);
  const effects = useGameStore((s) => s.effects);
  const flashAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!playerId) return;
    const hit = effects.some((e) => e.type === 'playerHit' && e.targetId === playerId);
    if (!hit) return;
    flashAtRef.current = Date.now();
    if (rafRef.current == null) {
      const loop = () => {
        forceTick((t) => t + 1);
        if (flashAtRef.current != null && Date.now() - flashAtRef.current < FLASH_DURATION_MS) {
          rafRef.current = requestAnimationFrame(loop);
        } else {
          rafRef.current = null;
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects, playerId]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  if (flashAtRef.current == null) return null;
  const age = Date.now() - flashAtRef.current;
  if (age >= FLASH_DURATION_MS) return null;
  const opacity = 0.45 * (1 - age / FLASH_DURATION_MS);

  return <View pointerEvents="none" style={[styles.overlay, { opacity }]} />;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ff2b2b' },
});
