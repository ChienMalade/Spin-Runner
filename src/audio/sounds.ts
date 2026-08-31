import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type SfxName = 'swordClash' | 'playerHit' | 'bonusPickup' | 'kill' | 'dash';

const SFX_SOURCES: Record<SfxName, number> = {
  swordClash: require('../../assets/sounds/sword-clash.wav'),
  playerHit: require('../../assets/sounds/player-hit.wav'),
  bonusPickup: require('../../assets/sounds/bonus-pickup.wav'),
  kill: require('../../assets/sounds/kill.wav'),
  dash: require('../../assets/sounds/dash.wav'),
};

let players: Partial<Record<SfxName, AudioPlayer>> | null = null;
let audioModeConfigured = false;
let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
}

function getPlayers(): Partial<Record<SfxName, AudioPlayer>> {
  if (!players) {
    players = {};
    (Object.keys(SFX_SOURCES) as SfxName[]).forEach((name) => {
      try {
        players![name] = createAudioPlayer(SFX_SOURCES[name]);
      } catch (error) {
        console.error('[audio] failed to create player for', name, error);
      }
    });
  }
  return players;
}

export async function initAudio(): Promise<void> {
  if (audioModeConfigured) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    audioModeConfigured = true;
  } catch (error) {
    console.error('[audio] failed to configure audio mode', error);
  }
}

export function playSfx(name: SfxName): void {
  if (muted) return;
  try {
    const player = getPlayers()[name];
    if (!player) return;
    player.seekTo(0);
    player.play();
  } catch (error) {
    console.error('[audio] failed to play sfx', name, error);
  }
}
