import { Group, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { RigidBody } from '@dimforge/rapier3d-compat';
import { KID } from '../core/Config';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { RapierModule } from '../physics/rapier';
import type { ShapeFactory } from '../world/ShapeFactory';

interface Toy {
  mesh: Object3D;
  body: RigidBody;
  home: Vector3;
}

const CRATE_COLORS = [0xff8fa3, 0xffd166, 0x8fd3ff, 0x9be6a5, 0xb39ddb, 0xff9f68];
const BALL_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b];

/**
 * Real rigid bodies for the robot to shove around. This is where the "physics
 * feel" comes from: the robot itself is unbreakable, but everything it touches
 * tumbles, rolls and stacks.
 */
export class Toys {
  readonly group = new Group();

  private readonly toys: Toy[] = [];

  constructor(
    private readonly factory: ShapeFactory,
    private readonly physics: PhysicsWorld,
    private readonly R: RapierModule,
  ) {}

  build(): void {
    this.buildCrates();
    this.buildBalls();
    this.buildStack();
    this.buildWobbleBoard();
  }

  private register(mesh: Object3D, body: RigidBody, home: Vector3): void {
    this.group.add(mesh);
    this.physics.addMeshSync(mesh, body);
    this.toys.push({ mesh, body, home: home.clone() });
  }

  private buildCrates(): void {
    const spots: Array<[number, number]> = [
      [-4, 4],
      [-2.6, 4.8],
      [-4.6, 2.6],
      [6, 6],
      [8.6, -14],
      [-16, -2],
    ];
    spots.forEach(([x, z], index) => {
      const size = 0.52;
      const { mesh, body } = this.factory.dynamicBox(
        {
          size: [size, size, size],
          position: [x, 0.4, z],
          euler: [0, index * 0.4, 0],
          color: CRATE_COLORS[index % CRATE_COLORS.length],
          roughness: 0.75,
        },
        { mass: 6, friction: 0.85, restitution: 0.12 },
      );
      this.register(mesh, body, new Vector3(x, 0.4, z));
    });
  }

  private buildBalls(): void {
    const spots: Array<[number, number]> = [
      [2, 12],
      [-10, 6],
      [20, 6],
    ];
    spots.forEach(([x, z], index) => {
      const radius = 0.42;
      const { mesh, body } = this.factory.dynamicBall(
        {
          radius,
          position: [x, radius + 0.2, z],
          color: BALL_COLORS[index % BALL_COLORS.length],
          roughness: 0.35,
        },
        { mass: 8, friction: 0.6, restitution: 0.45, angularDamping: 0.25 },
      );
      this.register(mesh, body, new Vector3(x, radius + 0.2, z));
    });
  }

  private buildStack(): void {
    const size = 0.44;
    for (let i = 0; i < 4; i += 1) {
      const x = -6;
      const y = size / 2 + i * (size + 0.005);
      const z = 10;
      const { mesh, body } = this.factory.dynamicBox(
        {
          size: [size, size, size],
          position: [x, y, z],
          color: CRATE_COLORS[(i + 2) % CRATE_COLORS.length],
          roughness: 0.7,
        },
        { mass: 5, friction: 0.9, restitution: 0.05 },
      );
      this.register(mesh, body, new Vector3(x, y, z));
    }
  }

  /** A low pivoting plank the robot can walk onto and tilt. */
  private buildWobbleBoard(): void {
    const x = 12;
    const z = 4;
    const pivotHeight = 0.28;

    const fulcrumHeight = pivotHeight - 0.08;
    const fulcrum = this.factory.fixedCylinderPair({
      radius: 0.18,
      height: fulcrumHeight,
      position: [x, fulcrumHeight / 2, z],
      color: 0x8d99ae,
      roughness: 0.6,
    });
    this.group.add(fulcrum.mesh);

    const plankLength = 3.2;
    const { mesh, body } = this.factory.dynamicBox(
      {
        size: [plankLength, 0.16, 0.72],
        position: [x, pivotHeight, z],
        color: 0xffb703,
        roughness: 0.55,
      },
      { mass: 14, friction: 0.9, restitution: 0.02, angularDamping: 0.4 },
    );
    this.register(mesh, body, new Vector3(x, pivotHeight, z));

    // Pivot at the plank's centre and at the top of the fulcrum, so the board
    // tilts in the vertical plane under the robot's weight.
    this.physics.world.createImpulseJoint(
      this.R.JointData.revolute(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: fulcrumHeight / 2, z: 0 },
        { x: 0, y: 0, z: 1 },
      ),
      body,
      fulcrum.body,
      true,
    );
  }

  /** Safety net: anything that somehow leaves the park comes back home. */
  fixedUpdate(): void {
    for (const toy of this.toys) {
      if (toy.body.translation().y < KID.toyRespawnY) this.sendHome(toy);
    }
  }

  private sendHome(toy: Toy): void {
    toy.body.setTranslation(
      { x: toy.home.x, y: toy.home.y, z: toy.home.z },
      true,
    );
    toy.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    toy.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Called by the pause menu's "Rapikan" button. */
  resetAll(): void {
    for (const toy of this.toys) this.sendHome(toy);
  }

  dispose(): void {
    for (const toy of this.toys) this.physics.removeMeshSync(toy.mesh);
    this.group.removeFromParent();
    this.toys.length = 0;
  }
}
