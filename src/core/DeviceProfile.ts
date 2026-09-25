export type QualityTier = 'minimal' | 'low' | 'medium' | 'high';

export interface TierSettings {
  /** Shown to the grown-up in the pause menu. */
  label: string;
  /** Upper bound for the device pixel ratio. Fill rate is the usual bottleneck. */
  pixelRatio: number;
  /**
   * Only honoured at renderer construction: WebGL cannot enable multisampling
   * after the context already exists.
   */
  antialias: boolean;
  shadows: boolean;
  shadowMapSize: number;
  /**
   * Half-width of the shadow camera, in metres, centred on the robot. Keeping
   * this tight is what makes shadows both cheap and sharp: a 7 m half-extent on
   * a 512 map is ~36 texels/m, against ~13 texels/m for a park-wide map.
   */
  shadowExtent: number;
  /** Softer filtering, at roughly double the shadow lookup cost. */
  pcfSoft: boolean;
}

export type QualityMode = 'auto' | QualityTier;

export const TIER_ORDER: QualityTier[] = ['minimal', 'low', 'medium', 'high'];

export const TIER_SETTINGS: Record<QualityTier, TierSettings> = {
  minimal: {
    label: 'Sangat Rendah',
    pixelRatio: 0.65,
    antialias: false,
    shadows: false,
    shadowMapSize: 256,
    shadowExtent: 6,
    pcfSoft: false,
  },
  low: {
    label: 'Rendah',
    pixelRatio: 0.85,
    antialias: false,
    shadows: true,
    shadowMapSize: 512,
    shadowExtent: 7,
    pcfSoft: false,
  },
  medium: {
    label: 'Sedang',
    pixelRatio: 1,
    antialias: false,
    shadows: true,
    shadowMapSize: 1024,
    shadowExtent: 14,
    pcfSoft: false,
  },
  high: {
    label: 'Tinggi',
    pixelRatio: 1.3,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    shadowExtent: 18,
    pcfSoft: true,
  },
};

/** Reads the unmasked GPU string, then throws the probe context away. */
export function readGpuName(): string {
  if (typeof document === 'undefined') return 'unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'unknown';
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const name = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

/**
 * Best-effort first guess. It only picks the *starting* tier: the runtime
 * measurement in `Quality` takes over from there, and the pause menu lets a
 * grown-up override it.
 */
export function detectTier(gpuName: string = readGpuName()): QualityTier {
  const name = gpuName.toLowerCase();
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  // Software rasterisers, and integrated parts that cannot afford MSAA or a
  // shadow pass at all.
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(name)) {
    return 'minimal';
  }
  if (/\b(gma|hd graphics|uhd graphics|graphics media accelerator)\b/.test(name)) return 'low';
  if (/intel/.test(name) && !/arc/.test(name) && !/iris/.test(name)) return 'low';
  if (cores <= 2 || memory <= 4) return 'low';
  if (/\b(iris|vega|radeon graphics)\b/.test(name)) return 'medium';
  if (/geforce|rtx|radeon rx|quadro|apple m/.test(name) && cores >= 6) return 'high';
  return 'medium';
}

const STORAGE_KEY = 'robotgen.quality';
const STATS_KEY = 'robotgen.stats';

export function loadQualityMode(): QualityMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'auto') return 'auto';
    if (stored && TIER_ORDER.includes(stored as QualityTier)) return stored as QualityTier;
  } catch {
    // Private browsing can throw on storage access.
  }
  return 'auto';
}

export function saveQualityMode(mode: QualityMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not worth surfacing: the choice just will not persist.
  }
}

export function loadStatsVisible(): boolean {
  try {
    return localStorage.getItem(STATS_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveStatsVisible(visible: boolean): void {
  try {
    localStorage.setItem(STATS_KEY, visible ? '1' : '0');
  } catch {
    // Not worth surfacing.
  }
}
