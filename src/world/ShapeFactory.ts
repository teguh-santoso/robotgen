import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
} from 'three';
import type { BufferGeometry, Object3D } from 'three';
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

/**
 * Creates the mesh + Rapier collider pairs the playground is built from. Shares
 * one material and one geometry per distinct shape so a busy park still keeps a
 * small memory footprint.
 */
export class ShapeFactory {
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly geometries = new Map<string, BufferGeometry>();

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

  private dynamicBody(
    position: [number, number, number],
    options: DynamicOptions,
  ): RigidBody {
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

  fixedCylinder(options: CylinderOptions): Mesh {
    return this.fixedCylinderPair(options).mesh;
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

  /**
   * Invisible static collider. Used where the visual is an InstancedMesh or a
   * hand-built mesh that needs a simpler collision volume underneath.
   */
  staticCollider(
    shape: 'box' | 'cylinder' | 'ball',
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

  dispose(): void {
    for (const geo of this.geometries.values()) geo.dispose();
    for (const mat of this.materials.values()) mat.dispose();
    this.geometries.clear();
    this.materials.clear();
  }

  static collect(root: Object3D): Mesh[] {
    const meshes: Mesh[] = [];
    root.traverse((child) => {
      if (child instanceof Mesh) meshes.push(child);
    });
    return meshes;
  }
}
