import { Vector3 } from 'three';

const _right = new Vector3();
const _up = new Vector3();

/**
 * Snaps a shadow-camera target onto the shadow map's texel grid, measured along
 * the light's own axes rather than the world's.
 *
 * The snapped point still travels with the robot; what gets quantised is its
 * position *within* the grid. That is the point: it pins the world-to-texel
 * mapping so a world point always lands on the same fractional spot in the
 * shadow map. Without it the map slides by a fraction of a texel every frame and
 * shadow edges crawl.
 *
 * Kept free of any renderer dependency so the maths can be verified on its own.
 */
export function snapToShadowTexel(
  position: Vector3,
  lightOffset: Vector3,
  extent: number,
  mapSize: number,
  out: Vector3,
): Vector3 {
  const texel = (extent * 2) / mapSize;
  _right.set(0, 1, 0).cross(lightOffset).normalize();
  _up.copy(lightOffset).normalize().cross(_right).normalize();

  out.copy(position);
  const alongRight = out.dot(_right);
  const alongUp = out.dot(_up);
  out.addScaledVector(_right, Math.round(alongRight / texel) * texel - alongRight);
  out.addScaledVector(_up, Math.round(alongUp / texel) * texel - alongUp);
  return out;
}
