import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { QUALITY } from './Config';

export class Renderer {
  readonly renderer: WebGLRenderer;
  private pixelRatio: number;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  /** Called by Quality when it decides the device needs a lighter frame budget. */
  setPixelRatio(ratio: number): void {
    if (Math.abs(ratio - this.pixelRatio) < 0.01) return;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
  }

  get currentPixelRatio(): number {
    return this.pixelRatio;
  }

  setShadowsEnabled(enabled: boolean): void {
    if (this.renderer.shadowMap.enabled === enabled) return;
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.needsUpdate = true;
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
