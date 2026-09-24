import {
  AdditiveBlending,
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Scene, Texture } from 'three';
import { KID } from '../core/Config';

interface Star {
  mesh: Mesh;
  glow: Sprite;
  base: Vector3;
  spin: number;
  collected: boolean;
  /** Counts up while the collect animation plays. */
  pop: number;
}

function starGeometry(outer: number, inner: number, depth: number): ExtrudeGeometry {
  const shape = new Shape();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.022,
    bevelThickness: 0.018,
    bevelSegments: 2,
  });
  geometry.center();
  return geometry;
}

function glowTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255, 245, 190, 0.95)');
  gradient.addColorStop(0.35, 'rgba(255, 214, 92, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 200, 60, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

/**
 * The collectibles. Collection is deliberately forgiving: stars drift toward a
 * nearby robot so a six year old never has to line up precisely.
 */
export class Stars {
  readonly group = new Group();
  readonly total: number;
  collected = 0;

  onCollected?: (collected: number, total: number) => void;
  onComplete?: () => void;

  private readonly stars: Star[] = [];
  private readonly geometry: ExtrudeGeometry;
  private readonly material: MeshStandardMaterial;
  private readonly glowMap: Texture;
  private elapsed = 0;
  private completeFired = false;

  constructor(scene: Scene, anchors: Vector3[]) {
    scene.add(this.group);
    this.geometry = starGeometry(0.26, 0.11, 0.09);
    this.material = new MeshStandardMaterial({
      color: 0xffd24a,
      emissive: 0xffb400,
      emissiveIntensity: 0.85,
      metalness: 0.4,
      roughness: 0.3,
    });
    this.glowMap = glowTexture();
    this.total = anchors.length;

    for (const anchor of anchors) {
      const mesh = new Mesh(this.geometry, this.material);
      mesh.castShadow = true;
      const glow = new Sprite(
        new SpriteMaterial({
          map: this.glowMap,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0.9,
        }),
      );
      glow.scale.setScalar(1.5);
      glow.position.copy(anchor);

      this.group.add(mesh, glow);
      this.stars.push({
        mesh,
        glow,
        base: anchor.clone(),
        spin: Math.random() * Math.PI * 2,
        collected: false,
        pop: 0,
      });
    }
  }

  /** Distance check that ignores height, so stars cannot be grabbed through a floor. */
  private reachable(star: Star, robot: Vector3, radius: number, heightTolerance: number): number {
    const dx = star.base.x - robot.x;
    const dz = star.base.z - robot.z;
    const dy = Math.abs(star.base.y - robot.y);
    if (dy > heightTolerance) return Number.POSITIVE_INFINITY;
    const horizontal = Math.hypot(dx, dz);
    return horizontal < radius ? horizontal : Number.POSITIVE_INFINITY;
  }

  fixedUpdate(dt: number, robotPosition: Vector3): void {
    for (const star of this.stars) {
      if (star.collected) continue;

      const collectDistance = this.reachable(star, robotPosition, KID.starCollectRadius, 1.1);
      if (collectDistance < Number.POSITIVE_INFINITY) {
        star.collected = true;
        star.pop = 0.0001;
        this.collected += 1;
        this.onCollected?.(this.collected, this.total);
        if (this.collected >= this.total && !this.completeFired) {
          this.completeFired = true;
          this.onComplete?.();
        }
        continue;
      }

      const magnetDistance = this.reachable(star, robotPosition, KID.starMagnetRadius, 1.4);
      if (magnetDistance < Number.POSITIVE_INFINITY) {
        const pull = (1 - magnetDistance / KID.starMagnetRadius) * KID.starMagnetSpeed * dt;
        star.base.x += (robotPosition.x - star.base.x) * pull;
        star.base.z += (robotPosition.z - star.base.z) * pull;
        star.base.y += (robotPosition.y + 0.2 - star.base.y) * pull * 0.5;
      }
    }
  }

  renderUpdate(dt: number): void {
    this.elapsed += dt;

    for (const star of this.stars) {
      if (star.collected && star.pop >= 1) {
        star.mesh.visible = false;
        star.glow.visible = false;
        continue;
      }

      if (star.collected) {
        star.pop = Math.min(star.pop + dt * 3.2, 1);
        const scale = star.pop < 0.4 ? 1 + star.pop * 1.6 : Math.max(0, 1.64 * (1 - (star.pop - 0.4) / 0.6));
        star.mesh.position.y = star.base.y + star.pop * 0.9;
        star.mesh.scale.setScalar(scale);
        star.mesh.rotation.y += dt * 14;
        star.glow.position.y = star.mesh.position.y;
        star.glow.scale.setScalar(1.5 + star.pop * 5);
        (star.glow.material as SpriteMaterial).opacity = 0.9 * (1 - star.pop);
        continue;
      }

      star.spin += dt * 1.6;
      const bob = Math.sin(this.elapsed * 2 + star.base.x * 0.7) * 0.12;
      star.mesh.position.set(star.base.x, star.base.y + bob, star.base.z);
      star.mesh.rotation.y = star.spin;
      star.mesh.rotation.z = Math.sin(this.elapsed * 1.3 + star.base.z) * 0.15;
      star.glow.position.set(star.base.x, star.base.y + bob, star.base.z);
      star.glow.scale.setScalar(1.5 + Math.sin(this.elapsed * 3 + star.spin) * 0.14);
    }
  }

  reset(): void {
    this.collected = 0;
    this.completeFired = false;
    for (const star of this.stars) {
      star.collected = false;
      star.pop = 0;
      star.mesh.visible = true;
      star.glow.visible = true;
      star.mesh.scale.setScalar(1);
      (star.glow.material as SpriteMaterial).opacity = 0.9;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.glowMap.dispose();
    for (const star of this.stars) {
      (star.glow.material as SpriteMaterial).dispose();
    }
    this.stars.length = 0;
  }
}
