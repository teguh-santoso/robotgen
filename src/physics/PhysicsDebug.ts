import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import type { Scene } from 'three';
import type { PhysicsWorld } from './PhysicsWorld';

/** Draws Rapier's own collision wireframes. Only instantiated with ?debug. */
export class PhysicsDebug {
  readonly lines: LineSegments;
  private readonly geometry: BufferGeometry;

  constructor(
    private readonly physics: PhysicsWorld,
    scene: Scene,
  ) {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(0), 4));
    this.lines = new LineSegments(
      this.geometry,
      new LineBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true }),
    );
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    scene.add(this.lines);
  }

  update(): void {
    const { vertices, colors } = this.physics.world.debugRender();
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(vertices, 3),
    );
    this.geometry.setAttribute(
      'color',
      new BufferAttribute(colors, 4),
    );
  }

  setVisible(visible: boolean): void {
    this.lines.visible = visible;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.geometry.dispose();
    (this.lines.material as LineBasicMaterial).dispose();
  }
}
