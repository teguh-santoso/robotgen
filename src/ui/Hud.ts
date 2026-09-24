import { DEBUG } from '../core/Config';
import { canFullscreen, el, iconButton, markUi, toggleFullscreen } from './dom';

export interface HudCallbacks {
  onPause: () => void;
  onToggleSound: () => boolean;
}

/**
 * Deliberately sparse: one big star counter, three round buttons. No text a
 * child has to read to keep playing.
 */
export class Hud {
  private readonly starPill: HTMLDivElement;
  private readonly starCount: HTMLSpanElement;
  private readonly deviceLabel: HTMLDivElement;
  private readonly fpsLabel: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly soundButton: HTMLButtonElement;
  private hintTimer = 0;
  private lastFps = 0;
  private fpsTimer = 0;
  private lastDevice = '';

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    const top = markUi(el('div', 'hud-top'));

    this.starPill = el('div', 'hud-stars');
    this.starPill.append(el('span', 'hud-star-icon'));
    this.starCount = el('span', undefined, '0 / 0');
    this.starPill.append(this.starCount);

    const buttons = el('div', 'hud-buttons');
    this.deviceLabel = el('div', 'hud-device', '');

    this.soundButton = iconButton('\u{1F50A}', 'Suara', () => {
      const muted = callbacks.onToggleSound();
      this.setSoundMuted(muted);
    });

    const pauseButton = iconButton('\u23F8', 'Berhenti sebentar', callbacks.onPause);

    buttons.append(this.deviceLabel, this.soundButton, pauseButton);
    if (canFullscreen()) {
      buttons.append(iconButton('\u26F6', 'Layar penuh', () => void toggleFullscreen()));
    }

    top.append(this.starPill, buttons);

    this.hint = el('div', 'hud-hint');
    this.fpsLabel = el('div', 'hud-fps');
    this.fpsLabel.style.display = DEBUG ? '' : 'none';

    root.append(top, this.hint, this.fpsLabel);
  }

  setStars(collected: number, total: number): void {
    this.starCount.textContent = `${collected} / ${total}`;
    this.starPill.classList.remove('bump');
    // Force a reflow so the bump animation can replay on consecutive collects.
    void this.starPill.offsetWidth;
    this.starPill.classList.add('bump');
  }

  setDevice(label: string, connected: boolean): void {
    if (!connected || !label) {
      this.deviceLabel.style.display = 'none';
      this.lastDevice = '';
      return;
    }
    if (label === this.lastDevice) return;
    this.lastDevice = label;
    this.deviceLabel.style.display = '';
    this.deviceLabel.textContent = label;
  }

  setSoundMuted(muted: boolean): void {
    this.soundButton.textContent = muted ? '\u{1F507}' : '\u{1F50A}';
    this.soundButton.classList.toggle('toggle-off', muted);
  }

  showHint(text: string, seconds: number): void {
    this.hint.textContent = text;
    this.hint.classList.add('visible');
    this.hintTimer = seconds;
  }

  hideHint(): void {
    this.hint.classList.remove('visible');
    this.hintTimer = 0;
  }

  update(dt: number, fps: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint.classList.remove('visible');
    }
    if (!DEBUG) return;
    this.fpsTimer += dt;
    if (this.fpsTimer < 0.4) return;
    this.lastFps = fps;
    this.fpsTimer = 0;
    this.fpsLabel.textContent = `${this.lastFps.toFixed(0)} fps`;
  }
}
