import {
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Mesh, Scene, Texture } from 'three';
import { PLAYGROUND } from '../core/Config';
import type { ShapeFactory } from './ShapeFactory';

const GRASS = 0x8ed177;
const ROCK = 0xc9b8a8;
const FENCE_COLORS = [0xff8fa3, 0xffd166, 0x8fd3ff, 0xb39ddb, 0x9be6a5];
const DEFAULT_UP = new Vector3(0, 1, 0);

function makeGrassTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8ed177';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    ctx.fillStyle = Math.random() > 0.5 ? '#84c76f' : '#9ad983';
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, 2 + Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Meshes that never move get their matrix composed once instead of every frame. */
function freeze<T extends Mesh>(mesh: T): T {
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

/**
 * A friendly, fully bounded park. Every surface is gentle enough that the robot
 * never gets stuck, and the floor is flat so a child can just hold the stick
 * forward and stay safe.
 *
 * Everything static is handed to the factory as an instanced batch rather than
 * as individual meshes: the park used to cost ~89 draw calls, and on the weak
 * integrated GPUs this game targets, draw submission is real CPU time.
 */
export class Playground {
  readonly group = new Group();
  readonly spawnPoint = new Vector3(0, 0.75, 16);
  readonly spawnYaw = Math.PI;
  readonly starAnchors: Vector3[] = [];

  private readonly factory: ShapeFactory;
  private readonly grassTexture: Texture;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(scene: Scene, factory: ShapeFactory) {
    this.factory = factory;
    scene.add(this.group);
    this.grassTexture = makeGrassTexture();
    this.buildGround();
    this.buildFence();
    this.buildHighDeck();
    this.buildStairDeck();
    this.buildTowerAndSlide();
    this.buildGates();
    this.buildRocks();
    this.buildTrees();
    this.buildFlowers();
    for (const mesh of this.factory.flushInstances()) this.group.add(freeze(mesh));
    this.defineStarAnchors();
  }

  // --- ground ------------------------------------------------------------

  private buildGround(): void {
    const size = PLAYGROUND.radius * 2 + 40;
    const mesh = this.factory.fixedBox({
      size: [size, 2, size],
      position: [0, -1, 0],
      color: GRASS,
      roughness: 0.95,
    });
    (mesh.material as MeshStandardMaterial).map = this.grassTexture;
    this.group.add(freeze(mesh));
  }

  // --- boundary fence ----------------------------------------------------

  private buildFence(): void {
    const segments = 24;
    const radius = PLAYGROUND.radius;
    const chord = 2 * radius * Math.sin(Math.PI / segments);

    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const nextAngle = ((i + 1) / segments) * Math.PI * 2;
      const midAngle = (angle + nextAngle) / 2;

      this.factory.staticBox(
        [chord + 0.12, 1.1, 0.5],
        [Math.cos(midAngle) * radius, 0.55, Math.sin(midAngle) * radius],
        FENCE_COLORS[i % FENCE_COLORS.length],
        [0, -midAngle + Math.PI / 2, 0],
      );
      this.factory.staticCylinder(
        0.34,
        1.5,
        [Math.cos(angle) * radius, 0.75, Math.sin(angle) * radius],
        FENCE_COLORS[(i + 2) % FENCE_COLORS.length],
      );
    }
  }

  // --- landmarks ---------------------------------------------------------

  private buildHighDeck(): void {
    const x = -13;
    const z = -10;
    const top = 1.4;
    const rise = 1.4;
    const run = 6;

    this.factory.staticBox([12, top, 12], [x, top / 2, z], 0xe9c46a);

    // A gentle ~13 degree ramp up to the deck. Deck's +z face sits at z + 6.
    const length = Math.hypot(run, rise);
    const angle = -Math.atan2(rise, run);
    this.factory.staticBox(
      [4, 0.4, length],
      [x, rise / 2, z + 6 + run / 2],
      0xffb703,
      [angle, 0, 0],
    );

    for (const [dx, dz] of [
      [-5.4, -5.4],
      [5.4, -5.4],
      [-5.4, 5.4],
      [5.4, 5.4],
    ]) {
      this.factory.staticCylinder(0.16, 2.2, [x + dx, top + 1.1, z + dz], 0xfff3d6);
    }
  }

  private buildStairDeck(): void {
    const x = 10;
    const z = -6;
    const top = 1.2;

    this.factory.staticBox([8, top, 8], [x, top / 2, z], 0xa0e0c0);

    // Four 0.3 m steps: comfortably under the 0.35 m autostep limit.
    for (let i = 0; i < 4; i += 1) {
      const height = top - 0.3 * i;
      this.factory.staticBox(
        [0.4, height, 3.2],
        [x + 4.2 + 0.4 * i, height / 2, z],
        0x8fd3ff,
      );
    }
  }

  private buildTowerAndSlide(): void {
    const x = 16;
    const z = 12;
    const top = 2.4;

    this.factory.staticBox([5, top, 5], [x, top / 2, z], 0xffc6de);

    // Eight 0.3 m steps climbing to the tower.
    for (let i = 0; i < 8; i += 1) {
      const height = top - 0.3 * i;
      this.factory.staticBox(
        [0.4, height, 2.4],
        [x - 2.7 - 0.4 * i, height / 2, z],
        0xffe08a,
      );
    }

    // Slide down the tower's +z side. Negative euler.x tilts the +z end down.
    const drop = top - 0.15;
    const length = 5.6;
    const slideRun = Math.sqrt(length * length - drop * drop);
    const highZ = z + 2.5 + 0.7;
    this.factory.staticBox(
      [2.2, 0.3, length],
      [x, 0.15 + drop / 2, highZ + slideRun / 2],
      0xff9f68,
      [-Math.atan2(drop, slideRun), 0, 0],
    );
  }

  private buildGates(): void {
    const gates: Array<[number, number, number]> = [
      [-2, 8, 0x9be6a5],
      [6, -20, 0xb39ddb],
      [-20, -2, 0x8fd3ff],
    ];
    for (const [x, z, color] of gates) {
      for (const dx of [-1.6, 1.6]) {
        this.factory.staticCylinder(0.22, 3.4, [x + dx, 1.7, z], color);
      }
      this.factory.staticBox([4.1, 0.45, 0.45], [x, 3.6, z], color);
    }
  }

  private buildRocks(): void {
    const rocks: Array<[number, number, number]> = [
      [-4, -14, 1.1],
      [2, -16, 0.8],
      [22, -8, 1.3],
      [-24, 10, 1.0],
      [12, 26, 1.2],
      [-14, 24, 0.9],
    ];
    for (const [x, z, radius] of rocks) {
      this.factory.staticBall(radius, [x, radius * 0.45, z], ROCK);
    }
  }

  private buildTrees(): void {
    const count = 20;
    const trunkGeo = new CylinderGeometry(0.28, 0.34, 2.6, 8);
    const leafGeo = new ConeGeometry(1.7, 3.4, 9);
    const trunkMat = new MeshStandardMaterial({ color: 0x9c6b4a, roughness: 0.9 });
    const leafMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const leafPalette = [0x63c96b, 0x4fb85f, 0x7ad987, 0x59bd68];

    const trunks = new InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new InstancedMesh(leafGeo, leafMat, count);
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    this.disposables.push(trunkGeo, leafGeo, trunkMat, leafMat);

    const matrix = new Matrix4();
    const color = new Color();
    let placed = 0;

    for (let attempt = 0; placed < count && attempt < 400; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = PLAYGROUND.radius * (0.55 + Math.random() * 0.4);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (this.tooCloseToLandmark(x, z)) continue;

      const scale = 0.85 + Math.random() * 0.5;
      const rotation = new Quaternion().setFromAxisAngle(DEFAULT_UP, Math.random() * 6.28);
      const scaleVec = new Vector3(scale, scale, scale);

      matrix.compose(new Vector3(x, 1.3 * scale, z), rotation, scaleVec);
      trunks.setMatrixAt(placed, matrix);

      matrix.compose(new Vector3(x, 4.1 * scale, z), rotation, scaleVec);
      leaves.setMatrixAt(placed, matrix);
      color.setHex(leafPalette[Math.floor(Math.random() * leafPalette.length)]);
      leaves.setColorAt(placed, color);

      this.factory.staticCollider('cylinder', [0.5 * scale, 4.6 * scale, 0], [x, 2.3 * scale, z]);
      placed += 1;
    }

    trunks.count = placed;
    leaves.count = placed;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.group.add(freeze(trunks), freeze(leaves));
  }

  private tooCloseToLandmark(x: number, z: number): boolean {
    for (const [lx, lz, lr] of PLAYGROUND.keepClear) {
      const dx = x - lx;
      const dz = z - lz;
      if (dx * dx + dz * dz < lr * lr) return true;
    }
    return false;
  }

  private buildFlowers(): void {
    const count = 60;
    const headGeo = new SphereGeometry(0.22, 8, 6);
    const stemGeo = new CylinderGeometry(0.04, 0.04, 0.5, 5);
    const headMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const stemMat = new MeshStandardMaterial({ color: 0x5cb85c, roughness: 0.9 });
    const heads = new InstancedMesh(headGeo, headMat, count);
    const stems = new InstancedMesh(stemGeo, stemMat, count);
    this.disposables.push(headGeo, stemGeo, headMat, stemMat);

    const palette = [0xff8fa3, 0xffd166, 0xfff3d6, 0xb39ddb, 0xff9f68];
    const matrix = new Matrix4();
    const color = new Color();

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = PLAYGROUND.radius * (0.15 + Math.random() * 0.78);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const scale = 0.8 + Math.random() * 0.7;
      const scaleVec = new Vector3(scale, scale, scale);

      matrix.compose(new Vector3(x, 0.25 * scale, z), new Quaternion(), scaleVec);
      stems.setMatrixAt(i, matrix);
      matrix.compose(new Vector3(x, 0.55 * scale, z), new Quaternion(), scaleVec);
      heads.setMatrixAt(i, matrix);
      color.setHex(palette[Math.floor(Math.random() * palette.length)]);
      heads.setColorAt(i, color);
    }
    heads.instanceMatrix.needsUpdate = true;
    stems.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    this.group.add(freeze(heads), freeze(stems));
  }

  private defineStarAnchors(): void {
    this.starAnchors.push(
      new Vector3(4, 1.0, 8),
      new Vector3(-13, 2.6, -10),
      new Vector3(10, 2.4, -6),
      new Vector3(16, 3.8, 12),
      new Vector3(17.7, 1.5, 15.5),
      new Vector3(-8, 1.0, 14),
      new Vector3(-2, 1.0, -16),
      new Vector3(19, 1.0, -18),
      new Vector3(-22, 1.0, 4),
      new Vector3(8, 1.0, 24),
    );
  }

  dispose(): void {
    this.group.removeFromParent();
    this.grassTexture.dispose();
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
  }
}
