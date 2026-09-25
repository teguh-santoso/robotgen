import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { BufferGeometry } from 'three';
import type { ColliderDesc, RigidBody } from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RapierModule } from '../physics/rapier';

export interface BodyStyle {
  color: number;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
}

export interface BoxOptions extends BodyStyle {
  size: [number, number, number];
  position: [number, number, number];
  euler?: [number, number, number];
}

export interface CylinderOptions extends BodyStyle {
  radius: number;
  height: number;
  position: [number, number, number];
  euler?: [number, number, number];
  segments?: number;
}

export interface SphereOptions extends BodyStyle {
  radius: number;
  position: [number, number, number];
  widthSegments?: number;
  heightSegments?: number;
}

export interface DynamicOptions {
  mass: number;
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
}

export interface DynamicBody {
  mesh: Mesh;
  body: RigidBody;
}

type BatchKind = 'box' | 'cylinder' | 'ball';

const BATCH_MATERIAL: Record<BatchKind, { roughness: number; metalness: number }> = {
  box: { roughness: 0.7, metalness: 0.05 },
  cylinder: { roughness: 0.7, metalness: 0.05 },
  ball: { roughness: 0.95, metalness: 0 },
};

// Scratch objects: composition happens all over the playground builders, and
// allocating a Matrix4 per prop would be pure garbage.
const _matrix = new Matrix4();
const _position = new Vector3();
const _scale = new Vector3();
const _quaternion = new Quaternion();
const _euler = new Euler();
const _color = new Color();

/** Collects transforms so a whole category of props can share one draw call. */
class InstanceBatch {
  private readonly matrices: Matrix4[] = [];
  private readonly colors: Color[] = [];

  add(matrix: Matrix4, color: Color): void {
    this.matrices.push(matrix.clone());
    this.colors.push(color.clone());
  }

  get count(): number {
    return this.matrices.length;
  }

  build(geometry: BufferGeometry, material: MeshStandardMaterial): InstancedMesh | null {
    if (this.matrices.length === 0) return null;
    const mesh = new InstancedMesh(geometry, material, this.matrices.length);
    for (let i = 0; i < this.matrices.length; i += 1) {
      mesh.setMatrixAt(i, this.matrices[i]);
      mesh.setColorAt(i, this.colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }

  clear(): void {
    this.matrices.length = 0;
    this.colors.length = 0;
  }
}

/**
 * Creates the mesh + Rapier collider pairs the playground is built from.
 *
 * Static props are the bulk of the park and never move, so they are queued into
 * per-shape `InstancedMesh` batches instead of becoming individual meshes: the
 * whole park collapses from ~89 draw calls to a handful. Colliders are still
 * created one per prop, because the physics side is cheap and wants the exact
 * shape.
 *
 * The cost of batching is that roughness is uniform per shape kind; the previous
 * per-prop values (a slippery slide, rough rocks) are gone. At this art style it
 * is not visible.
 */
export class ShapeFactory {
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly batches: Record<BatchKind, InstanceBatch> = {
    box: new InstanceBatch(),
    cylinder: new InstanceBatch(),
    ball: new InstanceBatch(),
  };

  constructor(
    readonly physics: PhysicsWorld,
    private readonly R: RapierModule,
  ) {}

  material(style: BodyStyle): MeshStandardMaterial {
    const key = [
      style.color,
      style.roughness ?? 0.6,
      style.metalness ?? 0.05,
      style.emissive ?? 0,
      style.emissiveIntensity ?? 1,
    ].join('|');
    let found = this.materials.get(key);
    if (!found) {
      found = new MeshStandardMaterial({
        color: style.color,
        roughness: style.roughness ?? 0.6,
        metalness: style.metalness ?? 0.05,
        emissive: style.emissive ?? 0x000000,
        emissiveIntensity: style.emissiveIntensity ?? 1,
      });
      this.materials.set(key, found);
    }
    return found;
  }

  private boxGeometry(x: number, y: number, z: number): BufferGeometry {
    const key = `box:${x}:${y}:${z}`;
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = new BoxGeometry(x, y, z);
      this.geometries.set(key, geo);
    }
    return geo;
  }

  private cylinderGeometry(radius: number, height: number, segments: number): BufferGeometry {
    const key = `cyl:${radius}:${height}:${segments}`;
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = new CylinderGeometry(radius, radius, height, segments);
      this.geometries.set(key, geo);
    }
    return geo;
  }

  private sphereGeometry(radius: number, w: number, h: number): BufferGeometry {
    const key = `sph:${radius}:${w}:${h}`;
    let geo = this.geometries.get(key);
    if (!geo) {
      geo = new SphereGeometry(radius, w, h);
      this.geometries.set(key, geo);
    }
    return geo;
  }

  private static rotation(euler?: [number, number, number]): Quaternion | null {
    if (!euler) return null;
    return new Quaternion().setFromEuler(new Euler(euler[0], euler[1], euler[2]));
  }

  private prepare(mesh: Mesh, euler?: [number, number, number]): Mesh {
    if (euler) mesh.rotation.set(euler[0], euler[1], euler[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private fixedBody(position: [number, number, number], euler?: [number, number, number]): RigidBody {
    const desc = this.R.RigidBodyDesc.fixed().setTranslation(...position);
    const quat = ShapeFactory.rotation(euler);
    if (quat) desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    return this.physics.world.createRigidBody(desc);
  }

  private dynamicBody(position: [number, number, number], options: DynamicOptions): RigidBody {
    const desc = this.R.RigidBodyDesc.dynamic()
      .setTranslation(...position)
      .setLinearDamping(options.linearDamping ?? 0.05)
      .setAngularDamping(options.angularDamping ?? 0.15);
    return this.physics.world.createRigidBody(desc);
  }

  private applyDynamicOptions(collider: ColliderDesc, options: DynamicOptions): void {
    collider.setMass(options.mass);
    collider.setFriction(options.friction ?? 0.8);
    collider.setRestitution(options.restitution ?? 0.15);
  }

  // --- unique meshes (ground, joint parts) --------------------------------

  fixedBox(options: BoxOptions): Mesh {
    const [sx, sy, sz] = options.size;
    const mesh = this.prepare(
      new Mesh(this.boxGeometry(sx, sy, sz), this.material(options)),
      options.euler,
    );
    mesh.position.set(...options.position);
    const body = this.fixedBody(options.position, options.euler);
    this.physics.world.createCollider(
      this.R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setFriction(0.9),
      body,
    );
    return mesh;
  }

  /** Same as {@link fixedCylinder} but also hands back the body, for joints. */
  fixedCylinderPair(options: CylinderOptions): { mesh: Mesh; body: RigidBody } {
    const segments = options.segments ?? 16;
    const mesh = this.prepare(
      new Mesh(
        this.cylinderGeometry(options.radius, options.height, segments),
        this.material(options),
      ),
      options.euler,
    );
    mesh.position.set(...options.position);
    const body = this.fixedBody(options.position, options.euler);
    this.physics.world.createCollider(
      this.R.ColliderDesc.cylinder(options.height / 2, options.radius).setFriction(0.9),
      body,
    );
    return { mesh, body };
  }

  dynamicBox(options: BoxOptions, bodyOptions: DynamicOptions): DynamicBody {
    const [sx, sy, sz] = options.size;
    const mesh = this.prepare(
      new Mesh(this.boxGeometry(sx, sy, sz), this.material(options)),
      options.euler,
    );
    mesh.position.set(...options.position);
    const body = this.dynamicBody(options.position, bodyOptions);
    const collider = this.R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2);
    this.applyDynamicOptions(collider, bodyOptions);
    this.physics.world.createCollider(collider, body);
    return { mesh, body };
  }

  dynamicBall(options: SphereOptions, bodyOptions: DynamicOptions): DynamicBody {
    const w = options.widthSegments ?? 20;
    const h = options.heightSegments ?? 14;
    const mesh = this.prepare(
      new Mesh(this.sphereGeometry(options.radius, w, h), this.material(options)),
    );
    mesh.position.set(...options.position);
    const body = this.dynamicBody(options.position, bodyOptions);
    const collider = this.R.ColliderDesc.ball(options.radius);
    this.applyDynamicOptions(collider, bodyOptions);
    this.physics.world.createCollider(collider, body);
    return { mesh, body };
  }

  // --- batched static props ----------------------------------------------

  /** Collider only, no visual. For props already drawn by an InstancedMesh. */
  staticCollider(
    shape: BatchKind,
    size: [number, number, number],
    position: [number, number, number],
    euler?: [number, number, number],
  ): void {
    const body = this.fixedBody(position, euler);
    let desc: ColliderDesc;
    if (shape === 'box') {
      desc = this.R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2);
    } else if (shape === 'cylinder') {
      desc = this.R.ColliderDesc.cylinder(size[1] / 2, size[0]);
    } else {
      desc = this.R.ColliderDesc.ball(size[0]);
    }
    this.physics.world.createCollider(desc.setFriction(0.9), body);
  }

  staticBox(
    size: [number, number, number],
    position: [number, number, number],
    color: number,
    euler?: [number, number, number],
  ): void {
    const [sx, sy, sz] = size;
    const body = this.fixedBody(position, euler);
    this.physics.world.createCollider(
      this.R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setFriction(0.9),
      body,
    );
    this.pushInstance('box', position, euler, [sx, sy, sz], color);
  }

  staticCylinder(
    radius: number,
    height: number,
    position: [number, number, number],
    color: number,
    euler?: [number, number, number],
  ): void {
    const body = this.fixedBody(position, euler);
    this.physics.world.createCollider(
      this.R.ColliderDesc.cylinder(height / 2, radius).setFriction(0.9),
      body,
    );
    this.pushInstance('cylinder', position, euler, [radius * 2, height, radius * 2], color);
  }

  staticBall(
    radius: number,
    position: [number, number, number],
    color: number,
    squashY = 0.65,
  ): void {
    const body = this.fixedBody(position);
    this.physics.world.createCollider(
      this.R.ColliderDesc.ball(radius * 0.85).setFriction(0.9),
      body,
    );
    this.pushInstance('ball', position, undefined, [radius * 2, radius * 2 * squashY, radius * 2], color);
  }

  private pushInstance(
    kind: BatchKind,
    position: [number, number, number],
    euler: [number, number, number] | undefined,
    scale: [number, number, number],
    color: number,
  ): void {
    _quaternion.identity();
    if (euler) _quaternion.setFromEuler(_euler.set(euler[0], euler[1], euler[2]));
    _matrix.compose(
      _position.set(position[0], position[1], position[2]),
      _quaternion,
      _scale.set(scale[0], scale[1], scale[2]),
    );
    this.batches[kind].add(_matrix, _color.setHex(color));
  }

  /**
   * Turns everything queued by the `static*` helpers into one `InstancedMesh`
   * per shape kind. Call once, after the playground has been built.
   */
  flushInstances(): InstancedMesh[] {
    const built: InstancedMesh[] = [];
    const kinds: Array<[BatchKind, BufferGeometry]> = [
      ['box', new BoxGeometry(1, 1, 1)],
      ['cylinder', new CylinderGeometry(0.5, 0.5, 1, 12)],
      ['ball', new SphereGeometry(0.5, 16, 12)],
    ];

    for (const [kind, geometry] of kinds) {
      const batch = this.batches[kind];
      if (batch.count === 0) {
        geometry.dispose();
        continue;
      }
      const tuning = BATCH_MATERIAL[kind];
      const material = new MeshStandardMaterial({
        // instanceColor multiplies this, so it has to stay white.
        color: 0xffffff,
        roughness: tuning.roughness,
        metalness: tuning.metalness,
      });
      this.geometries.set(`batch:${kind}`, geometry);
      this.materials.set(`batch:${kind}`, material);

      const mesh = batch.build(geometry, material);
      batch.clear();
      if (!mesh) continue;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Static for the whole session.
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      built.push(mesh);
    }
    return built;
  }

  dispose(): void {
    for (const geo of this.geometries.values()) geo.dispose();
    for (const mat of this.materials.values()) mat.dispose();
    this.geometries.clear();
    this.materials.clear();
    for (const batch of Object.values(this.batches)) batch.clear();
  }
}
