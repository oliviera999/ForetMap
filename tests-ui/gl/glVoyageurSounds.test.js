import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  noteFrequency,
  soundScore,
  playVoyageurSound,
  setVoyageurSoundsAllowed,
  setVoyageurSfxMuted,
  isVoyageurSfxMuted,
} from '../../src/gl/utils/glVoyageurSounds.js';

function fakeAudioContext() {
  const created = { oscillators: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  class FakeCtx {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {};
    }
    createGain() {
      return { gain: param(), connect: vi.fn() };
    }
    createOscillator() {
      created.oscillators += 1;
      return { type: '', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    }
  }
  return { FakeCtx, created };
}

describe('glVoyageurSounds', () => {
  beforeEach(() => {
    localStorage.clear();
    setVoyageurSoundsAllowed(true);
  });
  afterEach(() => {
    delete window.AudioContext;
  });

  test('noteFrequency : la4 = 440 Hz, do4 ≈ 261,6 Hz', () => {
    expect(noteFrequency('A4')).toBe(440);
    expect(noteFrequency('C4')).toBeCloseTo(261.63, 1);
    expect(noteFrequency('C5')).toBeCloseTo(523.25, 1);
  });

  test('partitions : courtes, une par événement, cri selon le peuple', () => {
    for (const kind of [
      'gain-proche',
      'gain-loin',
      'level-up',
      'spell',
      'loupe',
      'gesture-salut',
      'gesture-danse',
    ]) {
      const score = soundScore(kind);
      expect(score.length).toBeGreaterThan(0);
      const end = Math.max(...score.map((n) => n.at + n.dur));
      expect(end).toBeLessThanOrEqual(0.6);
    }
    expect(soundScore('gesture-cri', { people: 'unicorn' })[0].type).toBe('sine');
    expect(soundScore('gesture-cri', { people: 'gnome' })[0].type).toBe('sawtooth');
    expect(soundScore('inconnu')).toEqual([]);
  });

  test('joue avec un contexte audio, se tait si l’élève ou l’admin a coupé', () => {
    const { FakeCtx, created } = fakeAudioContext();
    window.AudioContext = FakeCtx;
    expect(playVoyageurSound('level-up')).toBe(true);
    expect(created.oscillators).toBe(4);

    setVoyageurSfxMuted(true);
    expect(isVoyageurSfxMuted()).toBe(true);
    expect(playVoyageurSound('level-up')).toBe(false);

    setVoyageurSfxMuted(false);
    setVoyageurSoundsAllowed(false);
    expect(playVoyageurSound('level-up')).toBe(false);
  });
});
