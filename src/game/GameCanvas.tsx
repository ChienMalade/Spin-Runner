import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import type { BonusType, EffectType, PlayerState, SwordState } from '@/net/protocol';
import { computeCamera, worldToScreen } from './camera';
import { hslToHex, lerpColorHex } from './color';
import { playSfx, type SfxName } from '@/audio/sounds';

const GRID_SIZE = 180; // world units between grid lines — makes movement and zoom-out readable
const BONUS_RADIUS = 22; // world units — matches a player's radius at growth tier 0

const BONUS_COLORS: Record<BonusType, string> = {
  sword: '#f59e0b',
  spin: '#06b6d4',
  soul: '#a78bfa',
  heart: '#f43f5e',
  shield: '#3b82f6',
  speed: '#22c55e',
  upgrade: '#eab308',
};
const BONUS_ICONS: Record<BonusType, string> = {
  sword: '⚔️',
  spin: '🌀',
  soul: '👻',
  heart: '❤️',
  shield: '🛡️',
  speed: '👟',
  upgrade: '⭐',
};

const SWORD_BASE_COLOR = '#cfd8e3'; // "healthy" blade color a sword lerps away from toward red as it wears
const SWORD_TIER_PIP_COLOR = '#ffd76a'; // small gold studs near the hilt — one per upgrade tier, distinct from wear

// 'bonusPickup' and 'kill' don't use this ring-particle system — they get colorful bursts instead.
const EFFECT_LIFETIME_MS = 260;
const EFFECT_COLORS: Partial<Record<EffectType, string>> = {
  swordClash: '#fff6c9',
  playerHit: '#ff4d4d',
  swordBreak: '#8a8a8a',
};
const EFFECT_SFX: Partial<Record<EffectType, SfxName>> = {
  swordClash: 'swordClash',
  playerHit: 'playerHit',
  bonusPickup: 'bonusPickup',
  dash: 'dash',
};

interface Particle {
  id: number;
  type: EffectType;
  x: number;
  y: number;
  bornAt: number;
}

/** A single radiating dot in a "burst" animation (bonus pickup, kill) — moves outward from its
 * origin at a fixed speed and fades out over its lifetime. */
interface Burst {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number; // world units/sec
  color: string;
  size: number; // world units
  bornAt: number;
  lifetimeMs: number;
  /** Renders as an elongated streak along `angle` instead of a dot — the multiplier on `size`. */
  stretch?: number;
  /** Renders as a hollow, expanding ring instead of a filled dot — a shockwave rather than a spark. */
  ring?: boolean;
}

// Seeded from Date.now() (not 1) so ids stay unique across a dev Fast Refresh remount, which
// would otherwise reset the counter while old particles with the same small ids still linger.
let nextParticleId = Date.now();

function spawnBurst(
  out: Burst[],
  x: number,
  y: number,
  count: number,
  color: string,
  { speed = 90, spread = 40, size = 6, lifetimeMs = 420 } = {}
) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    out.push({
      id: nextParticleId++,
      x,
      y,
      angle,
      speed: speed + Math.random() * spread,
      color,
      size,
      bornAt: Date.now(),
      lifetimeMs,
    });
  }
}

// How fast smoothed values chase their live target — smaller is snappier, bigger is smoother.
const ZOOM_SMOOTH_TAU = 0.45;
const SIZE_SMOOTH_TAU = 0.35;

// Rotation "hit stop": a player's sword orbit briefly holds still on impact — as light as a light
// hit stop, purely visual (the real simulation never pauses), but visible to every viewer since the
// sword itself is a shared world object.
const CLASH_FREEZE_MS = 70;
const HIT_FREEZE_MS = 70;
const KILL_FREEZE_MS = 110;

// Screen shake: a small, decaying random camera offset, personal to whichever screen(s) the event
// actually happened on.
const CLASH_SHAKE = { mag: 4, durMs: 150 };
const HIT_SHAKE = { mag: 8, durMs: 200 };
const KILL_SHAKE = { mag: 16, durMs: 320 };

// A nicer, more game-y stack than the plain system default, with sane fallbacks per platform.
const NAME_FONT_FAMILY = Platform.select({
  web: "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif",
  ios: 'Avenir-Heavy',
  android: 'sans-serif-condensed',
  default: undefined,
});

function swordWorldPos(p: PlayerState, sword: SwordState) {
  const angle = p.swordOrbitAngle + sword.angleOffset;
  return { x: p.x + Math.cos(angle) * p.swordOrbitRadius, y: p.y + Math.sin(angle) * p.swordOrbitRadius };
}

function approach(current: number, target: number, dtSec: number, tau: number): number {
  const k = 1 - Math.exp(-dtSec / tau);
  return current + (target - current) * k;
}

export default function GameCanvas() {
  const { width, height } = useWindowDimensions();
  const players = useGameStore((s) => s.players);
  const bonuses = useGameStore((s) => s.bonuses);
  const effects = useGameStore((s) => s.effects);
  const playerId = useGameStore((s) => s.playerId);
  const arena = useGameStore((s) => s.arena);
  const showNames = useGameStore((s) => s.showNames);

  const particlesRef = useRef<Particle[]>([]);
  const burstsRef = useRef<Burst[]>([]);
  const smoothZoomRef = useRef<number | null>(null);
  const smoothRadiusRef = useRef<Map<string, number>>(new Map());
  const smoothOrbitRef = useRef<Map<string, number>>(new Map());
  const lastFrameRef = useRef(Date.now());
  const rafRef = useRef<number | null>(null);
  const [, setFrame] = useState(0);

  // Rotation freeze: playerId -> the angle to hold, and until when.
  const rotationFreezeRef = useRef<Map<string, { angle: number; until: number }>>(new Map());
  // Screen shake: only ever set when the local player was actually involved in the triggering event.
  const shakeRef = useRef({ mag: 0, until: 0, durMs: 1 });
  const shakeOffsetRef = useRef({ x: 0, y: 0 });

  function triggerShake(mag: number, durMs: number) {
    // Take the stronger of the two if a shake is already in progress, don't just reset it.
    if (mag < shakeRef.current.mag) return;
    shakeRef.current = { mag, until: Date.now() + durMs, durMs };
  }

  // A single persistent render loop drives both the growth-size/zoom smoothing and the particle
  // fade-out, so growing never "pops" straight to the new size — it eases there instead.
  useEffect(() => {
    const step = () => {
      const now = Date.now();
      const dtSec = Math.min(0.1, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const state = useGameStore.getState();
      const lp = state.players.find((p) => p.id === state.playerId) ?? null;
      const targetZoom = computeCamera(lp).zoom;
      smoothZoomRef.current = approach(smoothZoomRef.current ?? targetZoom, targetZoom, dtSec, ZOOM_SMOOTH_TAU);

      if (now < shakeRef.current.until) {
        const remainingFrac = (shakeRef.current.until - now) / shakeRef.current.durMs;
        const mag = shakeRef.current.mag * remainingFrac;
        const a = Math.random() * Math.PI * 2;
        shakeOffsetRef.current = { x: Math.cos(a) * mag, y: Math.sin(a) * mag };
      } else {
        shakeOffsetRef.current = { x: 0, y: 0 };
      }

      for (const p of state.players) {
        const curR = smoothRadiusRef.current.get(p.id) ?? p.radius;
        smoothRadiusRef.current.set(p.id, approach(curR, p.radius, dtSec, SIZE_SMOOTH_TAU));
        const curO = smoothOrbitRef.current.get(p.id) ?? p.swordOrbitRadius;
        smoothOrbitRef.current.set(p.id, approach(curO, p.swordOrbitRadius, dtSec, SIZE_SMOOTH_TAU));
      }

      particlesRef.current = particlesRef.current.filter((p) => now - p.bornAt < EFFECT_LIFETIME_MS);
      burstsRef.current = burstsRef.current.filter((b) => now - b.bornAt < b.lifetimeMs);
      setFrame((f) => f + 1);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const localPlayer = players.find((p) => p.id === playerId) ?? null;
  const rawCam = computeCamera(localPlayer);
  const cam = { x: rawCam.x, y: rawCam.y, zoom: smoothZoomRef.current ?? rawCam.zoom };
  const toScreen = (wx: number, wy: number) => {
    const s = worldToScreen(wx, wy, cam, width, height);
    return { x: s.x + shakeOffsetRef.current.x, y: s.y + shakeOffsetRef.current.y };
  };

  useEffect(() => {
    if (effects.length === 0) return;
    const now = Date.now();

    // The sword's own rotation briefly holds still on impact — a light "hit stop" that's visible to
    // every viewer (it's the shared sword itself), unlike the shake below, which is per-screen.
    const freezeRotation = (id: string | undefined, durationMs: number) => {
      if (!id) return;
      const p = players.find((pl) => pl.id === id);
      if (!p) return;
      rotationFreezeRef.current.set(id, { angle: p.swordOrbitAngle, until: now + durationMs });
    };

    for (const e of effects) {
      if (e.type === 'kill') {
        freezeRotation(e.actorId, KILL_FREEZE_MS);
        // The finishing-blow animation, shake and sound are exclusive to the killer's own client.
        if (e.actorId !== playerId) continue;
        triggerShake(KILL_SHAKE.mag, KILL_SHAKE.durMs);
        spawnBurst(burstsRef.current, e.x, e.y, 16, '#ffcf4d', {
          speed: 140,
          spread: 90,
          size: 9,
          lifetimeMs: 650,
        });
        spawnBurst(burstsRef.current, e.x, e.y, 10, '#ff5d3d', { speed: 110, spread: 60, size: 7, lifetimeMs: 600 });
        playSfx('kill');
        continue;
      }

      if (e.type === 'swordClash') {
        freezeRotation(e.actorId, CLASH_FREEZE_MS);
        freezeRotation(e.otherId, CLASH_FREEZE_MS);
        if (playerId === e.actorId || playerId === e.otherId) triggerShake(CLASH_SHAKE.mag, CLASH_SHAKE.durMs);
      } else if (e.type === 'playerHit') {
        freezeRotation(e.actorId, HIT_FREEZE_MS);
        if (playerId === e.targetId) triggerShake(HIT_SHAKE.mag, HIT_SHAKE.durMs);
      }

      if (e.type === 'bonusPickup') {
        spawnBurst(burstsRef.current, e.x, e.y, 8, e.bonusType ? BONUS_COLORS[e.bonusType] : '#ffffff');
      } else if (e.type === 'dash') {
        // A punchier burst than a plain trail: a shockwave ring at the launch point, a few fading
        // afterimages of the dasher's own body tracing back along the burst, and a wide fan of
        // elongated speed-line streaks flaring opposite the dash direction.
        const forward = e.angle ?? 0;
        const back = forward + Math.PI;
        const actor = players.find((pl) => pl.id === e.actorId);
        const bodyColor = actor ? (actor.isBot ? '#8a8a8a' : hslToHex(actor.hue, 0.65, 0.55)) : '#7dd3fc';
        const bodyRadius = actor?.radius ?? 22;

        burstsRef.current.push({
          id: nextParticleId++,
          x: e.x,
          y: e.y,
          angle: 0,
          speed: 0,
          color: '#bfe9ff',
          size: bodyRadius * 0.9,
          bornAt: now,
          lifetimeMs: 260,
          ring: true,
        });

        for (let i = 1; i <= 3; i++) {
          burstsRef.current.push({
            id: nextParticleId++,
            x: e.x - Math.cos(forward) * bodyRadius * 0.9 * i,
            y: e.y - Math.sin(forward) * bodyRadius * 0.9 * i,
            angle: 0,
            speed: 0,
            color: bodyColor,
            size: bodyRadius * (1 - i * 0.12),
            bornAt: now,
            lifetimeMs: 220 - i * 30,
          });
        }

        for (let i = 0; i < 18; i++) {
          const a = back + (Math.random() - 0.5) * 1.1;
          burstsRef.current.push({
            id: nextParticleId++,
            x: e.x,
            y: e.y,
            angle: a,
            speed: 130 + Math.random() * 160,
            color: Math.random() < 0.5 ? '#e0f6ff' : '#7dd3fc',
            size: 6 + Math.random() * 5,
            bornAt: now,
            lifetimeMs: 260 + Math.random() * 220,
            stretch: 3 + Math.random() * 3,
          });
        }
      } else {
        particlesRef.current.push({ id: nextParticleId++, type: e.type, x: e.x, y: e.y, bornAt: now });
      }

      const sfx = EFFECT_SFX[e.type];
      if (!sfx) continue;
      // Only what's on screen is heard: the local player has no line of sight past the camera.
      const s = toScreen(e.x, e.y);
      if (s.x >= 0 && s.x <= width && s.y >= 0 && s.y <= height) playSfx(sfx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects]);

  const arenaTL = arena ? toScreen(0, 0) : { x: 0, y: 0 };
  const arenaBR = arena ? toScreen(arena.width, arena.height) : { x: width, y: height };

  const gridLines: { key: string; style: object }[] = [];
  if (arena) {
    const worldLeft = Math.max(0, cam.x - width / 2 / cam.zoom);
    const worldRight = Math.min(arena.width, cam.x + width / 2 / cam.zoom);
    const worldTop = Math.max(0, cam.y - height / 2 / cam.zoom);
    const worldBottom = Math.min(arena.height, cam.y + height / 2 / cam.zoom);

    for (let gx = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE; gx <= worldRight; gx += GRID_SIZE) {
      const s = toScreen(gx, 0);
      gridLines.push({
        key: `v${gx}`,
        style: { position: 'absolute', left: s.x, top: arenaTL.y, width: 1, height: arenaBR.y - arenaTL.y },
      });
    }
    for (let gy = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE; gy <= worldBottom; gy += GRID_SIZE) {
      const s = toScreen(0, gy);
      gridLines.push({
        key: `h${gy}`,
        style: { position: 'absolute', left: arenaTL.x, top: s.y, width: arenaBR.x - arenaTL.x, height: 1 },
      });
    }
  }

  return (
    <View style={styles.root}>
      {arena && (
        <View
          style={{
            position: 'absolute',
            left: arenaTL.x,
            top: arenaTL.y,
            width: arenaBR.x - arenaTL.x,
            height: arenaBR.y - arenaTL.y,
            backgroundColor: '#161c28',
          }}
        />
      )}

      {gridLines.map((g) => (
        <View key={g.key} style={[g.style, styles.gridLine]} />
      ))}

      {bonuses.map((b) => {
        const s = toScreen(b.x, b.y);
        const r = Math.max(5, BONUS_RADIUS * cam.zoom);
        const iconSize = r * 1.1;
        return (
          <View
            key={b.id}
            style={{
              position: 'absolute',
              left: s.x - r,
              top: s.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              backgroundColor: BONUS_COLORS[b.type],
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <Text
              style={{ fontSize: iconSize, lineHeight: iconSize, textAlign: 'center', backgroundColor: 'transparent' }}
            >
              {BONUS_ICONS[b.type]}
            </Text>
          </View>
        );
      })}

      {players.map((p) => {
        if (!p.alive) return null;
        const center = toScreen(p.x, p.y);
        const displayRadius = smoothRadiusRef.current.get(p.id) ?? p.radius;
        const displayOrbit = smoothOrbitRef.current.get(p.id) ?? p.swordOrbitRadius;
        const radius = Math.max(2, displayRadius * cam.zoom);
        const bodyColor = p.isBot ? '#8a8a8a' : hslToHex(p.hue, 0.65, 0.55);
        const shielded = p.shieldUntil > Date.now();
        const frozen = rotationFreezeRef.current.get(p.id);
        const orbitAngle = frozen && Date.now() < frozen.until ? frozen.angle : p.swordOrbitAngle;

        return (
          <View key={p.id}>
            {p.swords.map((sword) => {
              const angle = orbitAngle + sword.angleOffset;
              const wp = { x: p.x + Math.cos(angle) * displayOrbit, y: p.y + Math.sin(angle) * displayOrbit };
              const sp = toScreen(wp.x, wp.y);
              const len = Math.max(3, displayRadius * 0.95 * cam.zoom);
              const w = Math.max(2, displayRadius * 0.32 * cam.zoom);
              const wear = 1 - sword.hp / sword.maxHp;
              const color = lerpColorHex(SWORD_BASE_COLOR, '#e0473b', wear);
              const segLen = len / p.swordTier;
              const pip = Math.max(1.5, Math.min(w * 0.65, segLen * 0.55));
              return (
                <View key={sword.id} style={{ position: 'absolute', left: sp.x, top: sp.y }}>
                  <View style={{ transform: [{ rotate: `${angle}rad` }] }}>
                    <View
                      style={{
                        position: 'absolute',
                        width: len,
                        height: w,
                        marginLeft: -len / 2,
                        marginTop: -w / 2,
                        backgroundColor: color,
                      }}
                    />
                    {/* Tier "studs" embedded in the blade — a visual level indicator kept separate
                        from the wear color above, so the two don't get confused. */}
                    {Array.from({ length: p.swordTier }).map((_, i) => (
                      <View
                        key={i}
                        style={{
                          position: 'absolute',
                          width: pip,
                          height: pip,
                          borderRadius: pip / 2,
                          backgroundColor: SWORD_TIER_PIP_COLOR,
                          left: -len / 2 + segLen * (i + 0.5) - pip / 2,
                          top: -pip / 2,
                        }}
                      />
                    ))}
                  </View>
                </View>
              );
            })}

            <View
              style={{
                position: 'absolute',
                left: center.x - radius,
                top: center.y - radius,
                width: radius * 2,
                height: radius * 2,
                borderRadius: radius,
                backgroundColor: bodyColor,
                borderWidth: shielded ? 3 : 0,
                borderColor: '#5d7bff',
              }}
            />
            {showNames && (() => {
              const nameFontSize = Math.max(9, Math.min(22, radius * 0.5));
              return (
                <Text
                  style={{
                    position: 'absolute',
                    left: center.x - 80,
                    top: center.y - radius - nameFontSize - 4,
                    width: 160,
                    textAlign: 'center',
                    color: 'rgba(255,255,255,0.78)',
                    fontSize: nameFontSize,
                    fontFamily: NAME_FONT_FAMILY,
                    fontWeight: '700',
                    textShadowColor: 'rgba(0,0,0,0.85)',
                    textShadowRadius: 3,
                    textShadowOffset: { width: 0, height: 1 },
                  }}
                  numberOfLines={1}
                >
                  {p.name}
                </Text>
              );
            })()}
          </View>
        );
      })}

      {particlesRef.current.map((particle) => {
        const s = toScreen(particle.x, particle.y);
        const age = (Date.now() - particle.bornAt) / EFFECT_LIFETIME_MS;
        const r = Math.max(1, (6 + age * 16) * cam.zoom);
        return (
          <View
            key={particle.id}
            style={{
              position: 'absolute',
              left: s.x - r,
              top: s.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              backgroundColor: EFFECT_COLORS[particle.type] ?? '#ffffff',
              opacity: Math.max(0, 1 - age),
            }}
          />
        );
      })}

      {burstsRef.current.map((b) => {
        const age = Date.now() - b.bornAt;
        const frac = age / b.lifetimeMs;
        const dist = b.speed * (age / 1000);
        const wx = b.x + Math.cos(b.angle) * dist;
        const wy = b.y + Math.sin(b.angle) * dist;
        const s = toScreen(wx, wy);

        if (b.ring) {
          const ringR = Math.max(1, b.size * cam.zoom * (1 + frac * 2.2));
          return (
            <View
              key={b.id}
              style={{
                position: 'absolute',
                left: s.x - ringR,
                top: s.y - ringR,
                width: ringR * 2,
                height: ringR * 2,
                borderRadius: ringR,
                borderWidth: Math.max(1, 3 * cam.zoom * (1 - frac)),
                borderColor: b.color,
                opacity: Math.max(0, 1 - frac),
              }}
            />
          );
        }

        if (b.stretch) {
          const len = Math.max(2, b.size * b.stretch * cam.zoom * (1 - frac * 0.3));
          const w = Math.max(1, b.size * 0.5 * cam.zoom);
          return (
            <View key={b.id} style={{ position: 'absolute', left: s.x, top: s.y }}>
              <View
                style={{
                  position: 'absolute',
                  width: len,
                  height: w,
                  marginLeft: -len / 2,
                  marginTop: -w / 2,
                  borderRadius: w / 2,
                  backgroundColor: b.color,
                  opacity: Math.max(0, 1 - frac),
                  transform: [{ rotate: `${b.angle}rad` }],
                }}
              />
            </View>
          );
        }

        const r = Math.max(1, b.size * cam.zoom * (1 - frac * 0.4));
        return (
          <View
            key={b.id}
            style={{
              position: 'absolute',
              left: s.x - r,
              top: s.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              backgroundColor: b.color,
              opacity: Math.max(0, 1 - frac),
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c0f16', overflow: 'hidden' },
  gridLine: { backgroundColor: 'rgba(255,255,255,0.05)' },
});
