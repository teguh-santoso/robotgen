import { Matrix4, Quaternion, Vector3 } from 'three';
import { clamp } from '../core/MathUtils';

const _axis = new Vector3();
const _fwd = new Vector3();
const _hinge = new Vector3();
const _thighDir = new Vector3();
const _xW = new Vector3();
const _yW = new Vector3();
const _zW = new Vector3();
const _basis = new Matrix4();
const _fallback = new Vector3();

export interface LegSolution {
  /** Thigh orientation expressed in the parent (pelvis) frame. */
  thighQuat: Quaternion;
  /** Flexion applied to the shin about its local +X axis. */
  kneeAngle: number;
}

export function createLegSolution(): LegSolution {
  return { thighQuat: new Quaternion(), kneeAngle: 0 };
}

/**
 * Analytic two-bone inverse kinematics.
 *
 * The knee is placed on the side the pole points to, which keeps the bend
 * deterministic and lets us skip any iterative solver. Both vectors must be
 * expressed in the frame of the leg's parent (the pelvis).
 *
 * @param hipLocal   hip position in parent space
 * @param footLocal  desired foot position in parent space
 * @param forwardLocal the direction the knee should bulge toward, in parent space
 */
export function solveLeg(
  hipLocal: Vector3,
  footLocal: Vector3,
  thighLength: number,
  shinLength: number,
  forwardLocal: Vector3,
  out: LegSolution,
): void {
  _axis.subVectors(footLocal, hipLocal);
  const rawDistance = _axis.length();
  if (rawDistance < 1e-5) {
    out.thighQuat.identity();
    out.kneeAngle = 0;
    return;
  }
  _axis.divideScalar(rawDistance);

  const minReach = Math.abs(thighLength - shinLength) + 1e-3;
  const maxReach = thighLength + shinLength - 1e-3;
  const distance = clamp(rawDistance, minReach, maxReach);

  const l1 = thighLength;
  const l2 = shinLength;

  // Interior angle at the knee, then the flexion we actually apply.
  const cosKnee = clamp((l1 * l1 + l2 * l2 - distance * distance) / (2 * l1 * l2), -1, 1);
  out.kneeAngle = Math.PI - Math.acos(cosKnee);

  // Angle between the hip->foot line and the thigh.
  const cosHip = clamp((l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance), -1, 1);
  const hipOffset = Math.acos(cosHip);

  // Hinge axis is perpendicular to the plane holding the leg and its pole.
  _fwd.copy(forwardLocal);
  _fwd.addScaledVector(_axis, -_fwd.dot(_axis));
  if (_fwd.lengthSq() < 1e-6) {
    _fallback.set(0, 1, 0);
    _fwd.copy(_fallback).addScaledVector(_axis, -_fallback.dot(_axis));
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
  }
  _fwd.normalize();
  _hinge.crossVectors(_fwd, _axis).normalize();

  // Swing the thigh off the hip->foot line, toward the pole.
  _thighDir.copy(_axis).applyAxisAngle(_hinge, -hipOffset);

  // Build a basis whose -Y follows the thigh and whose +X is the hinge, so the
  // shin can simply rotate about its own local X.
  _yW.copy(_thighDir).negate();
  _xW.copy(_hinge).addScaledVector(_yW, -_hinge.dot(_yW)).normalize();
  _zW.crossVectors(_xW, _yW);
  _basis.makeBasis(_xW, _yW, _zW);
  out.thighQuat.setFromRotationMatrix(_basis);
}
