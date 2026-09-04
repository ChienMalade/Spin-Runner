import React, { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { CHARACTERS, type Direction8 } from '@/game/phaser/spriteAssets';
import { CHARACTER_IDS, DEFAULT_CHARACTER } from '@/net/protocol';

/** Turning order for the preview: face-on first, then clockwise. This is what the 8-direction idle
 * art is for — you get to look a character over from every angle before committing to them. */
const TURN_ORDER: Direction8[] = [
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
  'east',
  'south-east',
];

/** The hue is no longer the player's to pick — it only tints their leaderboard dot, so it is drawn
 * at random. */
const HUES = [0, 30, 55, 90, 140, 175, 200, 230, 265, 300, 330];

const MAX_NAME_LEN = 16;
const NAME_ALLOWED_CHARS = /[^a-zA-Z0-9 -]/g;
const ARENA_CODE_LEN = 4;
const ARENA_CODE_ALLOWED_CHARS = /[^A-Z0-9]/g;
const WARNING_DURATION_MS = 2000;

const FULL_REASON_TEXT: Record<string, string> = {
  server_full: 'Serveur complet, réessaie dans un instant',
  arena_full: 'Cette arène est complète',
  arena_not_found: "Code d'arène introuvable",
};

export default function Lobby() {
  const join = useGameStore((s) => s.join);
  const full = useGameStore((s) => s.full);
  const fullReason = useGameStore((s) => s.fullReason);

  const [name, setName] = useState('');
  const [arenaCode, setArenaCode] = useState('');
  const [character, setCharacter] = useState(DEFAULT_CHARACTER);
  const [facing, setFacing] = useState(0);
  const [hue] = useState(HUES[Math.floor(Math.random() * HUES.length)]);
  const [showCharWarning, setShowCharWarning] = useState(false);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = name.trim();
  const sprites = CHARACTERS[character];
  const direction =
    TURN_ORDER[((facing % TURN_ORDER.length) + TURN_ORDER.length) % TURN_ORDER.length];

  const handleNameChange = (t: string) => {
    const cleaned = t.replace(NAME_ALLOWED_CHARS, '');
    if (cleaned !== t) {
      setShowCharWarning(true);
      if (warningTimer.current) clearTimeout(warningTimer.current);
      warningTimer.current = setTimeout(() => setShowCharWarning(false), WARNING_DURATION_MS);
    }
    setName(cleaned.slice(0, MAX_NAME_LEN));
  };

  const handleArenaCodeChange = (t: string) => {
    setArenaCode(t.toUpperCase().replace(ARENA_CODE_ALLOWED_CHARS, '').slice(0, ARENA_CODE_LEN));
  };

  const handlePlay = () => join(trimmed || 'Joueur', hue, character, arenaCode || undefined);

  return (
    <ScrollView contentContainerStyle={styles.wrap} style={styles.scroll}>
      <View style={styles.card}>
        <Text style={styles.kicker}>CHOISIS TON CHAMPION</Text>
        <Text style={styles.title}>SPIN·RUNNER</Text>

        {/* The stage: an arrow on each side of the character, turning them on the spot. */}
        <View style={styles.stage}>
          <Pressable
            onPress={() => setFacing((f) => f - 1)}
            style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
            accessibilityLabel="Tourner à gauche"
          >
            <Text style={styles.arrowGlyph}>‹</Text>
          </Pressable>

          <View style={styles.plinth}>
            <Image
              source={sprites.idle[direction]}
              style={[styles.hero, PIXELATED]}
              resizeMode="contain"
            />
            {/* A slab under the feet rather than a ring around the body. */}
            <View style={styles.plinthBar} />
          </View>

          <Pressable
            onPress={() => setFacing((f) => f + 1)}
            style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
            accessibilityLabel="Tourner à droite"
          >
            <Text style={styles.arrowGlyph}>›</Text>
          </Pressable>
        </View>

        <Text style={styles.heroName}>{sprites.label.toUpperCase()}</Text>

        <View style={styles.roster}>
          {CHARACTER_IDS.map((id) => {
            const selected = id === character;
            return (
              <Pressable
                key={id}
                onPress={() => {
                  setCharacter(id);
                  setFacing(0);
                }}
                style={[styles.slot, selected && styles.slotSelected]}
              >
                <Image
                  source={CHARACTERS[id].idle.south}
                  style={[styles.slotSprite, PIXELATED]}
                  resizeMode="contain"
                />
              </Pressable>
            );
          })}
        </View>

        <TextInput
          style={styles.input}
          placeholder="TON PSEUDO"
          placeholderTextColor="rgba(233,222,196,0.32)"
          value={name}
          onChangeText={handleNameChange}
          maxLength={MAX_NAME_LEN}
          onSubmitEditing={handlePlay}
        />
        {showCharWarning && (
          <Text style={styles.warning}>Lettres, chiffres, espaces et tirets uniquement</Text>
        )}
        {full && <Text style={styles.warning}>{FULL_REASON_TEXT[fullReason ?? 'server_full']}</Text>}

        <TextInput
          style={styles.input}
          placeholder="CODE D'ARÈNE"
          placeholderTextColor="rgba(233,222,196,0.28)"
          value={arenaCode}
          onChangeText={handleArenaCodeChange}
          maxLength={ARENA_CODE_LEN}
          autoCapitalize="characters"
          onSubmitEditing={handlePlay}
        />

        <Pressable
          style={({ pressed }) => [styles.playBtn, pressed && styles.playBtnPressed]}
          onPress={handlePlay}
        >
          <Text style={styles.playBtnText}>COMBATTRE</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** 64x64 art shown at 148px would be smoothly interpolated into mush by default. Nearest-neighbour
 * is the whole point of pixel art, and React Native Web passes this straight through to CSS. */
const PIXELATED = { imageRendering: 'pixelated' } as unknown as Record<string, unknown>;

const GOLD = '#e3b24a';
const PARCHMENT = '#e9dec4';

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0b0f0c' },
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },

  // Angular throughout: no rounded pills, no glowing discs, no colour swatches. A war banner, not
  // an app screen.
  card: {
    width: 400,
    maxWidth: '94%',
    backgroundColor: '#141a15',
    paddingVertical: 26,
    paddingHorizontal: 26,
    borderWidth: 2,
    borderColor: '#2f3a2c',
    borderTopColor: GOLD,
    borderTopWidth: 3,
    alignItems: 'center',
  },

  kicker: { color: GOLD, fontSize: 11, fontWeight: '800', letterSpacing: 5, marginBottom: 4 },
  title: { color: PARCHMENT, fontSize: 34, fontWeight: '900', letterSpacing: 2, marginBottom: 20 },

  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  arrow: {
    width: 42,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d251c',
    borderWidth: 2,
    borderColor: '#33402f',
  },
  arrowPressed: { backgroundColor: '#2a3527', borderColor: GOLD },
  arrowGlyph: { color: PARCHMENT, fontSize: 30, fontWeight: '900', lineHeight: 32 },

  plinth: { alignItems: 'center', paddingHorizontal: 6 },
  hero: { width: 148, height: 148 },
  plinthBar: {
    width: 118,
    height: 6,
    backgroundColor: '#2a3527',
    borderTopWidth: 2,
    borderTopColor: '#3d4b38',
    marginTop: -8,
  },

  heroName: {
    color: GOLD,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: 14,
    marginBottom: 16,
  },

  roster: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  slot: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1d251c',
    borderWidth: 2,
    borderColor: '#33402f',
  },
  slotSelected: { borderColor: GOLD, backgroundColor: '#26301f' },
  slotSprite: { width: 46, height: 46 },

  input: {
    width: '100%',
    backgroundColor: '#0e130e',
    borderWidth: 2,
    borderColor: '#2f3a2c',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: PARCHMENT,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  warning: { color: '#e2725b', fontSize: 12, fontWeight: '700', marginTop: -6, marginBottom: 10 },

  playBtn: {
    width: '100%',
    paddingVertical: 15,
    backgroundColor: '#8c2f2a',
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: 'center',
  },
  playBtnPressed: { backgroundColor: '#a33a34' },
  playBtnText: { color: PARCHMENT, fontSize: 17, fontWeight: '900', letterSpacing: 4 },
});
