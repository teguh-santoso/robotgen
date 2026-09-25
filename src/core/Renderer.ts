import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  PCFSoftShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { Camera, Scene } from 'three';

export interface RendererOptions {
  /** Cannot change after the context exists, so it comes from the initial tier. */
  antialias: boolean;
  /** Softer shadow filtering, at roughly double the lookup cost. */
  pcfSoft: boolean;
  /** Upper bound for the device pixel ratio. */
  pixelRatio: number;
}

export class Renderer {
  readonly renderer: WebGLRenderer;
  private pixelRatio: number;

  constructor(canvas: HTMLCanvasElement, options: RendererOptions) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: options.antialias,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = options.pcfSoft ? PCFSoftShadowMap : PCFShadowMap;

    // Never exceed the cap, but never upscale past the real density either.
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, options.pixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  get currentPixelRatio(): number {
    return this.pixelRatio;
  }

  /** Applies a tier's cap, treating the display's real density as a ceiling. */
  applyPixelRatio(cap: number): void {
    const next = Math.min(window.devicePixelRatio || 1, cap);
    if (Math.abs(next - this.pixelRatio) < 0.01) return;
    this.pixelRatio = next;
    this.renderer.setPixelRatio(next);
  }

  setShadowsEnabled(enabled: boolean): void {
    if (this.renderer.shadowMap.enabled === enabled) return;
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.needsUpdate = true;
  }

  get shadowsEnabled(): boolean {
    return this.renderer.shadowMap.enabled;
  }

  /** Compiles the shader variants the current scene needs, to avoid hitches later. */
  compile(scene: Scene, camera: Camera): void {
    this.renderer.compile(scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
