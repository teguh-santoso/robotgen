import {
  QUALITY_DOWNGRADE_FPS,
  QUALITY_DOWNGRADE_WINDOWS,
  QUALITY_SAMPLE_WINDOW,
  QUALITY_UPGRADE_FPS,
  QUALITY_UPGRADE_WINDOWS,
} from './Config';
import { TIER_ORDER, TIER_SETTINGS, loadQualityMode, saveQualityMode } from './DeviceProfile';
import type { QualityMode, QualityTier, TierSettings } from './DeviceProfile';
import type { Renderer } from './Renderer';

/**
 * Picks a render budget and keeps it honest.
 *
 * The starting tier comes from a device sniff, but a sniff is only a guess, so
 * the frame rate is measured every second and the tier walks up or down from
 * there. Pixel ratio and shadows are applied here; the shadow camera belongs to
 * the environment and is pushed out through `onChange`.
 */
export class Quality {
  private tier: QualityTier;
  private mode: QualityMode;
  private listener: ((settings: TierSettings) => void) | null = null;

  private frames = 0;
  private seconds = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  /** The tier we just promoted to, watched for a couple of windows. */
  private regretTier: QualityTier | null = null;
  private regretWindows = 0;
  /** Tiers a promotion has already failed at, so we stop oscillating. */
  private readonly banned = new Set<QualityTier>();

  constructor(
    private readonly renderer: Renderer,
    private readonly detected: QualityTier,
    mode: QualityMode = loadQualityMode(),
  ) {
    this.mode = mode;
    this.tier = mode === 'auto' ? detected : mode;
    this.apply();
  }

  get settings(): TierSettings {
    return TIER_SETTINGS[this.tier];
  }

  get currentTier(): QualityTier {
    return this.tier;
  }

  get currentMode(): QualityMode {
    return this.mode;
  }

  /** Registers the sink for settings that live outside the renderer. */
  onChange(listener: (settings: TierSettings) => void): void {
    this.listener = listener;
    listener(this.settings);
  }

  /** A grown-up picked a level, or asked for automatic again. */
  setMode(mode: QualityMode): void {
    this.mode = mode;
    saveQualityMode(mode);
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.regretTier = null;
    this.regretWindows = 0;
    this.banned.clear();
    this.setTier(mode === 'auto' ? this.detected : mode);
  }

  update(dt: number): void {
    this.frames += 1;
    this.seconds += dt;
    if (this.seconds < QUALITY_SAMPLE_WINDOW) return;

    const fps = this.frames / this.seconds;
    this.frames = 0;
    this.seconds = 0;

    if (this.mode !== 'auto') return;

    const index = TIER_ORDER.indexOf(this.tier);

    // A promotion that did not hold up is banned, so we do not bounce between
    // two tiers forever.
    if (this.regretTier === this.tier && this.regretWindows > 0) {
      this.regretWindows -= 1;
      if (fps < QUALITY_DOWNGRADE_FPS) {
        this.banned.add(this.tier);
        this.regretTier = null;
        this.regretWindows = 0;
        if (index > 0) this.setTier(TIER_ORDER[index - 1]);
        return;
      }
    }

    if (fps < QUALITY_DOWNGRADE_FPS) {
      this.slowWindows += 1;
      this.fastWindows = 0;
    } else if (fps > QUALITY_UPGRADE_FPS) {
      this.fastWindows += 1;
      this.slowWindows = 0;
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }

    if (this.slowWindows >= QUALITY_DOWNGRADE_WINDOWS && index > 0) {
      this.slowWindows = 0;
      this.setTier(TIER_ORDER[index - 1]);
      return;
    }

    if (this.fastWindows >= QUALITY_UPGRADE_WINDOWS && index < TIER_ORDER.length - 1) {
      this.fastWindows = 0;
      const next = TIER_ORDER[index + 1];
      if (this.banned.has(next)) return;
      this.regretTier = next;
      this.regretWindows = 2;
      this.setTier(next);
    }
  }

  private setTier(tier: QualityTier): void {
    this.tier = tier;
    this.apply();
    this.listener?.(this.settings);
  }

  private apply(): void {
    const settings = this.settings;
    this.renderer.applyPixelRatio(settings.pixelRatio);
    this.renderer.setShadowsEnabled(settings.shadows);
  }
}
