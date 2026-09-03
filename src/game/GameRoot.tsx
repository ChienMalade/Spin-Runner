import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import PhaserCanvas from '@/game/PhaserCanvas';
import HealthBar from '@/ui/HealthBar';
import Joystick from '@/ui/Joystick';
import DeathOverlay from '@/ui/DeathOverlay';
import SoundToggle from '@/ui/SoundToggle';
import BuffTimers from '@/ui/BuffTimers';
import LevelPanel from '@/ui/LevelPanel';
import DamageFlash from '@/ui/DamageFlash';
import DevToggle from '@/ui/DevToggle';
import DevPanel from '@/ui/DevPanel';
import SettingsToggle from '@/ui/SettingsToggle';
import SettingsPanel from '@/ui/SettingsPanel';
import SprintButton from '@/ui/SprintButton';
import Lobby from '@/ui/Lobby';
import Leaderboard from '@/ui/Leaderboard';
import ArenaBadge from '@/ui/ArenaBadge';
import RotateDeviceOverlay from '@/ui/RotateDeviceOverlay';
import { useGameStore } from '@/store/gameStore';
import { initAudio } from '@/audio/sounds';
import { useMouseAim } from '@/game/useMouseAim';
import { useSprintKey } from '@/game/useSprintKey';
import { useMuteKey } from '@/game/useMuteKey';

export default function GameRoot() {
  const connect = useGameStore((s) => s.connect);
  const joined = useGameStore((s) => s.joined);
  useMouseAim();
  useSprintKey();
  useMuteKey();

  useEffect(() => {
    void initAudio();
    connect();
  }, [connect]);

  if (!joined) {
    return (
      <>
        <Lobby />
        <RotateDeviceOverlay />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <PhaserCanvas />
      <Leaderboard />
      <DamageFlash />
      {/* data-hud marks every UI overlay so useMouseAim can ignore mousemove while the cursor is
          over a button/panel here — otherwise moving the mouse to click one drags the player's
          aim toward that corner of the screen instead of just clicking it. */}
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        {...({ dataSet: { hud: 'true' } } as object)}
      >
        <SprintButton />
        <HealthBar />
        <BuffTimers />
        <LevelPanel />
        <Joystick />
        <DeathOverlay />
        <SoundToggle />
        <DevToggle />
        <DevPanel />
        <SettingsToggle />
        <SettingsPanel />
        <ArenaBadge />
      </View>
      <RotateDeviceOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0f16' },
});
