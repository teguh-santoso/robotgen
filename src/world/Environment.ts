import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PMREMGenerator,
  Scene,
  Vector3,
} from 'three';
import type { WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PLAYGROUND } from '../core/Config';
import { snapToShadowTexel } from './shadowSnap';

const SKY = 0x9fd8ff;
/** Direction and distance of the sun from its target. */
const SUN_OFFSET = new Vector3(20, 30, 14).normalize().multiplyScalar(42);

const _target = new Vector3();

/**
 * Bright, cheerful lighting with no dark corners. The environment map comes from
 * three's built-in RoomEnvironment so the robot's metal stays believable without
 * shipping an HDR file.
 *
 * The shadow camera is deliberately small and follows the robot. A park-wide
 * shadow map at a sane resolution is both blurry and expensive; a tight one is
 * sharper *and* keeps the shadow pass down to whatever is near the robot.
 */
export class Environment {
  readonly sun: DirectionalLight;

  private readonly pmrem: PMREMGenerator;
  private readonly room: RoomEnvironment;
  private extent: number;
  private mapSize: number;

  constructor(
    private readonly scene: Scene,
    renderer: WebGLRenderer,
    extent: number,
    mapSize: number,
  ) {
    this.extent = extent;
    this.mapSize = mapSize;

    this.pmrem = new PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.room = new RoomEnvironment();
    const envMap = this.pmrem.fromScene(this.room, 0.04).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.55;
    scene.background = new Color(SKY);
    scene.fog = new Fog(SKY, PLAYGROUND.radius * 1.35, PLAYGROUND.radius * 2.6);

    scene.add(new HemisphereLight(0xcfeaff, 0x9ed17a, 1.1));

    this.sun = new DirectionalLight(0xfff2d8, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 110;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.setShadowExtent(extent);

    this.sun.position.copy(SUN_OFFSET);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.followTarget(new Vector3(0, 0, 0));
  }

  /**
   * Keeps the shadow camera centred on the action, snapped to the texel grid so
   * the shadow edges stay still while the robot walks.
   */
  followTarget(position: Vector3): void {
    const snapped = snapToShadowTexel(
      position,
      SUN_OFFSET,
      this.extent,
      this.mapSize,
      _target,
    );
    this.sun.target.position.copy(snapped);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(snapped).add(SUN_OFFSET);
  }

  setShadowExtent(extent: number): void {
    this.extent = extent;
    const camera = this.sun.shadow.camera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
  }

  setShadowMapSize(size: number): void {
    if (size === this.mapSize) return;
    this.mapSize = size;
    this.sun.shadow.mapSize.set(size, size);
    // three only allocates a new render target when the old one is gone.
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  dispose(): void {
    this.scene.environment = null;
    this.room.dispose();
    this.pmrem.dispose();
  }
}
