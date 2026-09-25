import { el, iconButton, markUi, canFullscreen, toggleFullscreen } from './dom';

export interface HudCallbacks {
  onPause: () => void;
  onToggleSound: () => boolean;
}

export interface HudStats {
  fps: number;
  ms: number;
  calls: number;
  triangles: number;
  tier: string;
}

/**
 * Deliberately sparse: one big star counter, three round buttons. No text a
 * child has to read to keep playing. The stats line is for the grown-up who has
 * to make it run on an old laptop.
 */
export class Hud {
  private readonly starPill: HTMLDivElement;
  private readonly starCount: HTMLSpanElement;
  private readonly deviceLabel: HTMLDivElement;
  private readonly statsLabel: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly soundButton: HTMLButtonElement;
  private hintTimer = 0;
  private lastDevice = '';
  private lastStats = '';

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
    this.statsLabel = el('div', 'hud-stats');
    this.statsLabel.style.display = 'none';

    root.append(top, this.hint, this.statsLabel);
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

  setStatsVisible(visible: boolean): void {
    this.statsLabel.style.display = visible ? '' : 'none';
  }

  setStats(stats: HudStats): void {
    const text =
      `${stats.fps.toFixed(0)} fps \u00B7 ${stats.ms.toFixed(1)} ms \u00B7 ` +
      `${stats.calls} draw \u00B7 ${(stats.triangles / 1000).toFixed(1)}k tri \u00B7 ${stats.tier}`;
    if (text === this.lastStats) return;
    this.lastStats = text;
    this.statsLabel.textContent = text;
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

  update(dt: number): void {
    if (this.hintTimer <= 0) return;
    this.hintTimer -= dt;
    if (this.hintTimer <= 0) this.hint.classList.remove('visible');
  }
}
