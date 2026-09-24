import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Points,
  PointsMaterial,
  Vector3,
} from 'three';
import type { Scene } from 'three';

const COUNT = 320;
const GRAVITY = -7.5;
const SPREAD = 4.2;
const RISE = 7.0;
const DURATION = 5.5;

const PALETTE = [
  [1.0, 0.56, 0.64],
  [1.0, 0.82, 0.4],
  [0.56, 0.83, 1.0],
  [0.61, 0.9, 0.65],
  [0.7, 0.62, 0.86],
  [1.0, 0.62, 0.41],
];

function dotTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/** Confetti burst for the moment every star has been collected. */
export class Celebration {
  readonly group = new Group();

  private readonly geometry: BufferGeometry;
  private readonly material: PointsMaterial;
  private readonly texture: CanvasTexture;
  private readonly points: Points;
  private readonly positions = new Float32Array(COUNT * 3);
  private readonly velocities = new Float32Array(COUNT * 3);
  private readonly origin = new Vector3();
  private remaining = 0;

  constructor(scene: Scene) {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));

    const colors = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i += 1) {
      const color = PALETTE[i % PALETTE.length];
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
    this.geometry.setAttribute('color', new BufferAttribute(colors, 3));

    this.texture = dotTexture();
    this.material = new PointsMaterial({
      size: 0.16,
      map: this.texture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.group.add(this.points);
    scene.add(this.group);
  }

  get isActive(): boolean {
    return this.remaining > 0;
  }

  start(origin: Vector3): void {
    this.origin.copy(origin);
    this.remaining = DURATION;
    this.points.visible = true;
    for (let i = 0; i < COUNT; i += 1) this.respawn(i, true);
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  stop(): void {
    this.remaining = 0;
    this.points.visible = false;
  }

  private respawn(index: number, initial: boolean): void {
    const i = index * 3;
    const angle = Math.random() * Math.PI * 2;
    const radius = initial ? Math.random() * 0.4 : Math.random() * 1.6;
    this.positions[i] = this.origin.x + Math.cos(angle) * radius;
    this.positions[i + 1] = this.origin.y + (initial ? 0.4 : 1.6 + Math.random() * 2.4);
    this.positions[i + 2] = this.origin.z + Math.sin(angle) * radius;

    const outward = SPREAD * (0.25 + Math.random() * 0.75);
    this.velocities[i] = Math.cos(angle) * outward;
    this.velocities[i + 1] = RISE * (0.5 + Math.random() * 0.6);
    this.velocities[i + 2] = Math.sin(angle) * outward;
  }

  update(dt: number): void {
    if (this.remaining <= 0) return;
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.stop();
      return;
    }

    for (let index = 0; index < COUNT; index += 1) {
      const i = index * 3;
      this.velocities[i + 1] += GRAVITY * dt;
      this.positions[i] += this.velocities[i] * dt;
      this.positions[i + 1] += this.velocities[i + 1] * dt;
      this.positions[i + 2] += this.velocities[i + 2] * dt;

      if (this.positions[i + 1] < this.origin.y - 0.4) this.respawn(index, false);
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    // Fade out over the last second so it does not vanish abruptly.
    this.material.opacity = Math.min(1, this.remaining / 1.2);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
