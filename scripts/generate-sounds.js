/**
 * Generates small placeholder WAV sound effects entirely in code (synthesized tones/noise with an
 * envelope) — no external audio files. Same approach as the sibling Wizard Chess project's
 * generate-sounds.js. Run with: npm run generate:sounds
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 44100;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'sounds');

function writeWavFile(filename, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, filename), buffer);
  console.log(`  wrote ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

function tone(freqHz, durationSec, { wave = 'sine', amplitude = 0.5, attack = 0.004, decay = 'exp' } = {}) {
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const phase = 2 * Math.PI * freqHz * t;
    let raw;
    if (wave === 'sine') raw = Math.sin(phase);
    else if (wave === 'triangle') raw = (2 / Math.PI) * Math.asin(Math.sin(phase));
    else raw = Math.sign(Math.sin(phase));
    const env = decay === 'exp' ? Math.exp(-4 * (t / durationSec)) : 1 - t / durationSec;
    const attackEnv = Math.min(1, t / attack);
    out[i] = raw * amplitude * env * attackEnv;
  }
  return out;
}

function noiseBurst(durationSec, amplitude = 0.35, sharpness = 18) {
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-sharpness * t);
    out[i] = (Math.random() * 2 - 1) * amplitude * env;
  }
  return out;
}

/** A tone whose frequency slides linearly from `freqStart` to `freqEnd` — a "whoosh"/descending boom. */
function sweepTone(freqStart, freqEnd, durationSec, { amplitude = 0.4 } = {}) {
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const freq = freqStart + (freqEnd - freqStart) * (t / durationSec);
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    const env = Math.exp(-3 * (t / durationSec));
    out[i] = Math.sin(phase) * amplitude * env;
  }
  return out;
}

/** A seamlessly loopable "cutting through the air" whoosh — noise pulsed by a sine that completes
 * exactly `cycles` full periods across `durationSec`, so it starts and ends at silence and can be
 * looped back-to-back without a click. Each pulse reads like one pass of a blade/cord through air;
 * the game speeds `playbackRate` up with actual spin speed so the pulses feel like real rotations. */
function whooshLoop(durationSec, cycles, amplitude = 0.35) {
  const n = Math.round(SAMPLE_RATE * durationSec);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const mod = Math.max(0, Math.sin((2 * Math.PI * cycles * t) / durationSec));
    const pulse = Math.pow(mod, 2.4);
    out[i] = (Math.random() * 2 - 1) * amplitude * pulse;
  }
  return out;
}

function mix(...parts) {
  const length = Math.max(...parts.map((p) => p.length));
  const out = new Array(length).fill(0);
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) out[i] += part[i];
  }
  return out;
}

console.log('Generating placeholder SFX into assets/sounds/ …');

// Metallic clang for two swords colliding: bright noise transient + a short ringing tone.
writeWavFile(
  'sword-clash.wav',
  mix(noiseBurst(0.08, 0.5, 30), tone(1800, 0.14, { wave: 'triangle', amplitude: 0.3, decay: 'exp' }))
);

// Dull thud for a sword landing on a player: low tone + soft noise, no ring.
writeWavFile('player-hit.wav', mix(tone(140, 0.12, { wave: 'square', amplitude: 0.35 }), noiseBurst(0.05, 0.3, 22)));

// Bright ascending two-note chime for picking up a bonus bubble.
writeWavFile(
  'bonus-pickup.wav',
  [
    ...tone(880, 0.06, { wave: 'triangle', amplitude: 0.32, decay: 'exp' }),
    ...tone(1318, 0.1, { wave: 'triangle', amplitude: 0.34, decay: 'exp' }),
  ]
);

// Satisfying finishing-blow "boom": big noise burst + a descending sub-bass sweep.
writeWavFile('kill.wav', mix(noiseBurst(0.35, 0.55, 6), sweepTone(360, 60, 0.4, { amplitude: 0.5 })));

// Quick air "whoosh" for a dash: a fast rising sweep plus a short burst of noise for texture.
writeWavFile('dash.wav', mix(sweepTone(220, 950, 0.18, { amplitude: 0.4 }), noiseBurst(0.16, 0.4, 16)));

// Looping "rope/blade cutting through the air" whoosh for fast sword spin — 3 pulses per loop.
writeWavFile('spin-loop.wav', whooshLoop(1.0, 3, 0.4));
