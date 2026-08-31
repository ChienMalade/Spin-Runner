import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGameStore } from '@/store/gameStore';

export default function SettingsPanel() {
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const showNames = useGameStore((s) => s.showNames);
  const toggleShowNames = useGameStore((s) => s.toggleShowNames);

  if (!settingsOpen) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Réglages</Text>
      <Pressable style={styles.row} onPress={toggleShowNames}>
        <Text style={styles.rowLabel}>Afficher les pseudos</Text>
        <View style={[styles.checkbox, showNames && styles.checkboxOn]}>
          {showNames && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 186,
    right: 16,
    width: 200,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  title: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600', flex: 1, marginRight: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: 'rgba(34,197,94,0.35)', borderColor: '#22c55e' },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
