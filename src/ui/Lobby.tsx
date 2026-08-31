import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';
import { hslToHex } from '@/game/color';

const HUE_CHOICES = [0, 30, 55, 90, 140, 175, 200, 230, 265, 300, 330];
const MAX_NAME_LEN = 16;
const NAME_ALLOWED_CHARS = /[^a-zA-Z0-9 -]/g;
const ARENA_CODE_LEN = 4;
const ARENA_CODE_ALLOWED_CHARS = /[^A-Z0-9]/g;
const WARNING_DURATION_MS = 2000;

const FULL_REASON_TEXT: Record<string, string> = {
  server_full: 'Serveur complet, réessaie dans un instant',
  arena_full: 'Cette arène est complète',
  arena_not_found: 'Code d\'arène introuvable',
};

export default function Lobby() {
  const join = useGameStore((s) => s.join);
  const full = useGameStore((s) => s.full);
  const fullReason = useGameStore((s) => s.fullReason);
  const [name, setName] = useState('');
  const [arenaCode, setArenaCode] = useState('');
  const [hue, setHue] = useState(HUE_CHOICES[Math.floor(Math.random() * HUE_CHOICES.length)]);
  const [showCharWarning, setShowCharWarning] = useState(false);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = name.trim();
  const previewColor = hslToHex(hue, 0.65, 0.55);

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

  const handlePlay = () => {
    join(trimmed || 'Joueur', hue, arenaCode || undefined);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} style={styles.scroll}>
      <View style={styles.glowRing} pointerEvents="none">
        <View style={[styles.glow, { backgroundColor: previewColor }]} />
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Spin-Runner</Text>
        <Text style={styles.subtitle}>Choisis ton style et fonce dans l'arène</Text>

        <View style={styles.previewWrap}>
          <View style={[styles.previewRing, { borderColor: previewColor }]}>
            <View style={[styles.preview, { backgroundColor: previewColor }]} />
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Ton pseudo"
          placeholderTextColor="rgba(255,255,255,0.35)"
          value={name}
          onChangeText={handleNameChange}
          maxLength={MAX_NAME_LEN}
          onSubmitEditing={handlePlay}
        />
        {showCharWarning && (
          <Text style={styles.warning}>Lettres, chiffres, espaces et tirets uniquement</Text>
        )}
        {full && (
          <Text style={styles.warning}>{FULL_REASON_TEXT[fullReason ?? 'server_full']}</Text>
        )}

        <Text style={styles.label}>Code d'arène (optionnel)</Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          placeholder="Ex : K7QX"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={arenaCode}
          onChangeText={handleArenaCodeChange}
          maxLength={ARENA_CODE_LEN}
          autoCapitalize="characters"
          onSubmitEditing={handlePlay}
        />
        <Text style={styles.hint}>Laisse vide pour rejoindre une arène au hasard</Text>

        <Text style={styles.label}>Couleur</Text>
        <View style={styles.swatchRow}>
          {HUE_CHOICES.map((h) => {
            const color = hslToHex(h, 0.65, 0.55);
            const selected = h === hue;
            return (
              <Pressable
                key={h}
                onPress={() => setHue(h)}
                style={[styles.swatch, { backgroundColor: color }, selected && styles.swatchSelected]}
              />
            );
          })}
        </View>

        <Pressable style={({ pressed }) => [styles.playBtn, pressed && styles.playBtnPressed]} onPress={handlePlay}>
          <Text style={styles.playBtnText}>Jouer</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0a0d13' },
  wrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  glowRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 1,
    height: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
    marginLeft: -260,
    marginTop: -260,
    opacity: 0.14,
  },
  card: {
    width: 420,
    maxWidth: '92%',
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 24,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 30,
    elevation: 12,
  },
  title: { color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: 0.5 },
  subtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600', marginTop: 6, marginBottom: 22 },
  previewWrap: { marginBottom: 22 },
  previewRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: { width: 78, height: 78, borderRadius: 39 },
  input: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 17,
    marginBottom: 18,
    textAlign: 'center',
  },
  warning: { color: '#f87171', fontSize: 12, fontWeight: '700', marginTop: -10, marginBottom: 16 },
  codeInput: { letterSpacing: 6, fontWeight: '800', marginBottom: 6 },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600', marginBottom: 18 },
  label: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28, justifyContent: 'center' },
  swatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, borderColor: 'transparent' },
  swatchSelected: { borderColor: '#fff', transform: [{ scale: 1.12 }] },
  playBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#f43f5e',
    alignItems: 'center',
    shadowColor: '#f43f5e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  playBtnPressed: { backgroundColor: '#e0304e', transform: [{ scale: 0.98 }] },
  playBtnText: { color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: 0.5 },
});
