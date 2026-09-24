import { QUALITY } from './Config';
import type { Renderer } from './Renderer';

type QualityTier = 0 | 1 | 2;

/**
 * Watches the frame rate and quietly drops the render budget when a device
 * cannot keep up, then restores it when there is headroom again. Kids should
 * never have to find a graphics menu.
 */
export class Quality {
  private tier: QualityTier = 0;
  private frameAccum = 0;
  private timeAccum = 0;

  constructor(private readonly renderer: Renderer) {
    this.apply();
  }

  update(dt: number): void {
    this.frameAccum += 1;
    this.timeAccum += dt;

    if (this.timeAccum < 1) return;

    const fps = this.frameAccum / this.timeAccum;
    const enoughSamples =
      this.frameAccum >= (fps < QUALITY.degradeFpsThreshold
        ? QUALITY.degradeSampleFrames
        : QUALITY.upgradeSampleFrames) / 60;

    if (!enoughSamples) {
      this.frameAccum = 0;
      this.timeAccum = 0;
      return;
    }

    if (fps < QUALITY.degradeFpsThreshold && this.tier < 2) {
      this.tier = (this.tier + 1) as QualityTier;
      this.apply();
    } else if (fps > QUALITY.upgradeFpsThreshold && this.tier > 0) {
      this.tier = (this.tier - 1) as QualityTier;
      this.apply();
    }

    this.frameAccum = 0;
    this.timeAccum = 0;
  }

  private apply(): void {
    const base = Math.min(window.devicePixelRatio || 1, QUALITY.maxPixelRatio);
    if (this.tier === 0) {
      this.renderer.setPixelRatio(base);
      this.renderer.setShadowsEnabled(true);
    } else if (this.tier === 1) {
      this.renderer.setPixelRatio(1);
      this.renderer.setShadowsEnabled(true);
    } else {
      this.renderer.setPixelRatio(1);
      this.renderer.setShadowsEnabled(false);
    }
  }
}
