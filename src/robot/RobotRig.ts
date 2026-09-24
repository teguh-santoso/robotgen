import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry, Object3D } from 'three';
import { ROBOT } from '../core/Config';

export interface LegJoints {
  /** Rotation joint at the hip; the IK root for this leg. */
  thigh: Object3D;
  shin: Object3D;
  foot: Object3D;
  /** Hip position inside the pelvis frame. */
  hipLocal: Vector3;
  /** +1 for the robot's left (local +X), -1 for its right. */
  sign: number;
}

const COLOR_BODY = 0xe9eef4;
const COLOR_ACCENT = 0x2f9bff;
const COLOR_DARK = 0x46525e;
const COLOR_VISOR = 0x0d2b3a;
const COLOR_GLOW = 0xffc53d;

/**
 * A chunky, friendly humanoid robot with a purposely oversized head. Metal PBR
 * materials keep it looking like a real machine; the proportions keep it cute.
 *
 * Joint names and hierarchy are deliberately simple so a GLTF humanoid could
 * later be dropped in without touching the IK or gait code.
 */
export class RobotRig {
  readonly root = new Group();
  readonly pelvis = new Group();
  readonly torso = new Group();
  readonly chest = new Group();
  readonly head = new Group();
  readonly shoulderLeft = new Group();
  readonly shoulderRight = new Group();
  readonly left: LegJoints;
  readonly right: LegJoints;

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: MeshStandardMaterial[] = [];

  constructor() {
    const body = this.material(COLOR_BODY, 0.88, 0.3);
    const accent = this.material(COLOR_ACCENT, 0.7, 0.32, 0x0a2f5c, 0.35);
    const dark = this.material(COLOR_DARK, 0.6, 0.5);
    const visor = this.material(COLOR_VISOR, 0.15, 0.2, 0x3fe0ff, 2.2);
    const glow = this.material(COLOR_GLOW, 0.4, 0.3, COLOR_GLOW, 1.6);

    this.root.add(this.pelvis);
    this.pelvis.add(
      this.box(0.3, 0.18, 0.2, body, 0, 0, 0),
      this.box(0.26, 0.06, 0.22, accent, 0, 0.08, 0),
    );

    this.pelvis.add(this.torso);
    this.torso.add(this.box(0.4, 0.36, 0.26, body, 0, 0.2, 0));

    this.torso.add(this.chest);
    this.chest.position.set(0, 0.34, 0);
    this.chest.add(this.box(0.44, 0.12, 0.26, accent, 0, 0, 0));

    this.chest.add(this.head);
    this.head.position.set(0, 0.06, 0);
    this.head.add(
      this.box(0.3, 0.22, 0.28, body, 0, 0.06, 0),
      this.box(0.22, 0.1, 0.03, visor, 0, 0.07, 0.145),
      this.cylinder(0.016, 0.1, dark, 0, 0.21, 0),
      this.sphere(0.038, glow, 0, 0.27, 0),
    );

    this.chest.add(this.shoulderLeft);
    this.shoulderLeft.position.set(ROBOT.shoulderOffsetX, -0.02, 0);
    this.buildArm(this.shoulderLeft, body, accent, dark);

    this.chest.add(this.shoulderRight);
    this.shoulderRight.position.set(-ROBOT.shoulderOffsetX, -0.02, 0);
    this.buildArm(this.shoulderRight, body, accent, dark);

    this.left = this.buildLeg(body, accent, dark, 1);
    this.right = this.buildLeg(body, accent, dark, -1);
    this.pelvis.add(this.left.thigh, this.right.thigh);
  }

  private buildArm(parent: Object3D, body: MeshStandardMaterial, accent: MeshStandardMaterial, dark: MeshStandardMaterial): void {
    parent.add(
      this.sphere(0.075, accent, 0, 0, 0),
      this.box(0.12, 0.38, 0.14, body, 0, -0.2, 0),
      this.box(0.11, 0.1, 0.13, dark, 0, -0.42, 0),
    );
  }

  private buildLeg(
    body: MeshStandardMaterial,
    accent: MeshStandardMaterial,
    dark: MeshStandardMaterial,
    sign: number,
  ): LegJoints {
    const thigh = new Group();
    thigh.position.set(sign * ROBOT.hipOffsetX, ROBOT.hipOffsetY, 0);
    thigh.add(
      this.sphere(0.085, accent, 0, 0, 0),
      this.box(0.13, ROBOT.thighLength, 0.15, body, 0, -ROBOT.thighLength / 2, 0),
    );

    const shin = new Group();
    shin.position.set(0, -ROBOT.thighLength, 0);
    shin.add(
      this.sphere(0.07, accent, 0, 0, 0),
      this.box(0.11, ROBOT.shinLength, 0.13, body, 0, -ROBOT.shinLength / 2, 0),
    );
    thigh.add(shin);

    const foot = new Group();
    foot.position.set(0, -ROBOT.shinLength, 0);
    foot.add(
      this.box(0.14, 0.07, 0.22, dark, 0, -ROBOT.ankleHeight / 2, 0.03),
      this.box(0.14, 0.02, 0.03, accent, 0, -ROBOT.ankleHeight, 0.13),
    );
    shin.add(foot);

    return {
      thigh,
      shin,
      foot,
      hipLocal: new Vector3(sign * ROBOT.hipOffsetX, ROBOT.hipOffsetY, 0),
      sign,
    };
  }

  private material(
    color: number,
    metalness: number,
    roughness: number,
    emissive = 0x000000,
    emissiveIntensity = 1,
  ): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color,
      metalness,
      roughness,
      emissive,
      emissiveIntensity,
    });
    this.materials.push(material);
    return material;
  }

  private box(
    w: number,
    h: number,
    d: number,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const geometry = new BoxGeometry(w, h, d);
    this.geometries.push(geometry);
    return this.mesh(geometry, material, x, y, z);
  }

  private cylinder(
    radius: number,
    height: number,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const geometry = new CylinderGeometry(radius, radius, height, 8);
    this.geometries.push(geometry);
    return this.mesh(geometry, material, x, y, z);
  }

  private sphere(
    radius: number,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const geometry = new SphereGeometry(radius, 12, 10);
    this.geometries.push(geometry);
    return this.mesh(geometry, material, x, y, z);
  }

  private mesh(
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.geometries.length = 0;
    this.materials.length = 0;
  }
}
