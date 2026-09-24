import { AUDIO } from '../core/Config';

/** C major pentatonic across two octaves, so any collect order sounds pleasant. */
const STAR_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];
const COMPLETE_NOTES = [523.25, 659.25, 783.99, 1046.5, 1318.51];

/**
 * Every sound is synthesised on the fly, so the game ships no audio files at
 * all. Nothing here is loud, low or sudden: this is a game for six year olds.
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /** Must be called from a user gesture (the MULAI button). */
  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : AUDIO.masterVolume;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : AUDIO.masterVolume;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  footstep(): void {
    this.noise(0.07, 900, 0.13);
    this.tone(120, 0.09, 'sine', 0.16);
  }

  jump(): void {
    this.sweep(340, 720, 0.18, 'triangle', 0.2);
  }

  land(): void {
    this.tone(90, 0.16, 'sine', 0.28);
    this.noise(0.1, 500, 0.1);
  }

  star(index: number): void {
    const note = STAR_NOTES[Math.min(index, STAR_NOTES.length - 1)];
    this.tone(note, 0.22, 'triangle', 0.24);
    this.tone(note * 2, 0.16, 'sine', 0.1);
  }

  complete(): void {
    COMPLETE_NOTES.forEach((note, i) => {
      this.tone(note, 0.4, 'triangle', 0.22, i * 0.12);
      this.tone(note * 1.5, 0.3, 'sine', 0.08, i * 0.12);
    });
  }

  respawn(): void {
    this.sweep(220, 660, 0.3, 'sine', 0.18);
  }

  click(): void {
    this.tone(880, 0.06, 'square', 0.08);
  }

  // --- primitives --------------------------------------------------------

  private tone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.muted) return;
    if (context.state === 'suspended') return;

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.muted) return;
    if (context.state === 'suspended') return;

    const start = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(duration: number, cutoff: number, peak: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.muted) return;
    if (context.state === 'suspended') return;

    const frames = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const start = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = context.createGain();
    gain.gain.setValueAtTime(peak, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
  }
}
