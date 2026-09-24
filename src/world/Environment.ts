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
import { QUALITY } from '../core/Config';

const SKY = 0x9fd8ff;
const PLAYGROUND_RADIUS = 34;

/**
 * Bright, cheerful lighting with no dark corners. The environment map comes from
 * three's built-in RoomEnvironment so the robot's metal stays believable without
 * shipping an HDR file.
 */
export class Environment {
  private readonly pmrem: PMREMGenerator;
  private readonly room: RoomEnvironment;

  constructor(
    private readonly scene: Scene,
    renderer: WebGLRenderer,
  ) {
    this.pmrem = new PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.room = new RoomEnvironment();
    const envMap = this.pmrem.fromScene(this.room, 0.04).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.55;
    scene.background = new Color(SKY);
    scene.fog = new Fog(SKY, PLAYGROUND_RADIUS * 0.9, PLAYGROUND_RADIUS * 2.6);

    const hemi = new HemisphereLight(0xcfeaff, 0x9ed17a, 1.1);
    scene.add(hemi);

    const sun = new DirectionalLight(0xfff2d8, 2.3);
    sun.position.copy(new Vector3(20, 30, 14));
    sun.castShadow = true;
    sun.shadow.mapSize.set(QUALITY.shadowMapSize, QUALITY.shadowMapSize);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    const extent = PLAYGROUND_RADIUS + 6;
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.target.position.set(0, 0, 0);
    scene.add(sun);
    scene.add(sun.target);
  }

  dispose(): void {
    this.scene.environment = null;
    this.room.dispose();
    this.pmrem.dispose();
  }
}
