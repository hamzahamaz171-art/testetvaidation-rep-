// src/services/playNotificationAlertSound.js
import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import { Buffer } from 'buffer';

let audioModeReady = false;
// Anti-spam par alerte
let lastAlertId = null;

async function ensureAudioMode() {
  if (audioModeReady) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    audioModeReady = true;
  } catch {
    // ignore
  }
}

function vibrateNotification() {
  try {
    if (Platform.OS !== 'web') {
      // Pattern court comme Messenger/Instagram
      Vibration.vibrate([0, 120, 70, 160]);
    }
  } catch {}
}

function playWebNotificationTone() {
  try {
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();

    const playTone = (start, freq, duration, volume = 0.12) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    const t0 = ctx.currentTime;
    playTone(t0, 1046.5, 0.16, 0.12); // C6
    playTone(t0 + 0.17, 1318.5, 0.18, 0.11); // E6

    setTimeout(() => { try { ctx.close(); } catch {} }, 700);
  } catch {}
}

function wavNotificationDataUri() {
  const sampleRate = 16000;
  const tones = [
    { freq: 1046.5, duration: 0.16, volume: 0.78 },
    { freq: 0, duration: 0.05, volume: 0 },
    { freq: 1318.5, duration: 0.18, volume: 0.72 },
  ];
  const totalDuration = tones.reduce((sum, t) => sum + t.duration, 0);
  const numSamples = Math.floor(sampleRate * totalDuration);
  const bitsPerSample = 8;
  const numChannels = 1;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const wstr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };

  wstr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  wstr(8, 'WAVE');
  wstr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  wstr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44, written = 0;
  tones.forEach((tone) => {
    const n = Math.floor(sampleRate * tone.duration);
    for (let i = 0; i < n && written < numSamples; i++, written++) {
      let sample = 0;
      if (tone.freq > 0) {
        const localT = i / sampleRate;
        const attack = Math.min(1, i / Math.max(1, sampleRate * 0.018));
        const release = Math.min(1, (n - 1 - i) / Math.max(1, sampleRate * 0.055));
        const env = Math.max(0, Math.min(1, attack, release));
        const fundamental = Math.sin(2 * Math.PI * tone.freq * localT);
        const harmonic = 0.28 * Math.sin(2 * Math.PI * tone.freq * 2 * localT);
        sample = (fundamental + harmonic) * env * tone.volume;
      }
      const u8 = 128 + Math.round(96 * sample);
      view.setUint8(offset++, Math.max(1, Math.min(255, u8)));
    }
  });

  while (written < numSamples) { view.setUint8(offset++, 128); written++; }

  return `data:audio/wav;base64,${Buffer.from(buffer).toString('base64')}`;
}

/**
 * Jouer notification avec anti-spam par alerte
 * @param {string|number} alertId
 */
export async function playNotificationAlertSound(alertId) {
  if (alertId === lastAlertId) return; // ignore répétition
  lastAlertId = alertId;

  vibrateNotification();

  if (Platform.OS === 'web') {
    playWebNotificationTone();
    return;
  }

  try {
    await ensureAudioMode();
    const uri = wavNotificationDataUri();
    const { sound } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: true, volume: 1.0 },
      (status) => {
        if (status?.didJustFinish) sound.unloadAsync().catch(() => {});
      },
      false
    );
  } catch {
    // fallback vibration seulement
  }
}