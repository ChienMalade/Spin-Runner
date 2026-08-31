import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type SfxName = 'swordClash' | 'playerHit' | 'bonusPickup' | 'kill' | 'dash';

const SFX_SOURCES: Record<SfxName, number> = {
  swordClash: require('../../assets/sounds/sword-clash.wav'),
  playerHit: require('../../assets/sounds/player-hit.wav'),
  bonusPickup: require('../../assets/sounds/bonus-pickup.wav'),
  kill: require('../../assets/sounds/kill.wav'),
  dash: require('../../assets/sounds/dash.wav'),
};
const SPIN_LOOP_SOURCE = require('../../assets/sounds/spin-loop.wav');

let players: Partial<Record<SfxName, AudioPlayer>> | null = null;
let spinLoopPlayer: AudioPlayer | null = null;
let audioModeConfigured = false;
let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (muted && spinLoopPlayer?.playing) spinLoopPlayer.pause();
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

/** Continuously drives the ambient "blade cutting the air" loop for fast sword spin. `intensity` is
 * 0..1 (same normalization the spin's visual trail uses) — silent and paused below a small
 * threshold, otherwise both volume and pitch/pace (via playbackRate) climb with it, so a faster
 * spin sounds like it's actually whipping through the air faster. Call every frame; cheap no-op when
 * nothing changes. */
export function updateSpinLoop(intensity: number): void {
  if (muted) return;
  let player = spinLoopPlayer;
  if (!player) {
    try {
      player = createAudioPlayer(SPIN_LOOP_SOURCE);
      player.loop = true;
      spinLoopPlayer = player;
    } catch (error) {
      console.error('[audio] failed to create spin loop player', error);
      return;
    }
  }
  if (intensity < 0.05) {
    if (player.playing) player.pause();
    return;
  }
  player.volume = Math.min(0.55, intensity * 0.6);
  player.playbackRate = 0.75 + intensity * 0.9;
  if (!player.playing) player.play();
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
