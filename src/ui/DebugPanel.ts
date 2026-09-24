import { GAIT, KID, MOVE } from '../core/Config';
import type { PhysicsDebug } from '../physics/PhysicsDebug';
import type { FollowCamera } from '../camera/FollowCamera';
import type { RobotController } from '../robot/RobotController';

interface DebugParams {
  rapierLines: boolean;
  walkSpeed: number;
  runSpeed: number;
  turnRate: number;
  stepHeight: number;
  strideWalk: number;
  armSwing: number;
  cameraDistance: number;
  cameraPitch: number;
  tidyToys: () => void;
  backToSpawn: () => void;
}

/**
 * Tuning panel, only reachable with `?debug`. Values are written straight back
 * into the shared config, so sliders take effect on the next tick. lil-gui is
 * imported lazily so it never lands in the normal player bundle.
 */
export async function createDebugPanel(options: {
  robot: RobotController;
  camera: FollowCamera;
  physicsDebug: PhysicsDebug;
  onTidyToys: () => void;
}): Promise<{ destroy: () => void }> {
  const { default: GUI } = await import('lil-gui');

  const params: DebugParams = {
    rapierLines: false,
    walkSpeed: MOVE.walkSpeed,
    runSpeed: MOVE.runSpeed,
    turnRate: MOVE.turnRate,
    stepHeight: GAIT.stepHeight,
    strideWalk: GAIT.strideLengthWalk,
    armSwing: GAIT.armSwingAmount,
    cameraDistance: KID.cameraDistance,
    cameraPitch: KID.cameraPitchDeg,
    tidyToys: options.onTidyToys,
    backToSpawn: () => options.robot.resetToSpawn(),
  };

  const gui = new GUI({ title: 'Robotgen debug' });

  gui.add(params, 'rapierLines').name('Garis fisika').onChange((value: boolean) => {
    options.physicsDebug.setVisible(value);
  });

  const movement = gui.addFolder('Gerak');
  movement.add(params, 'walkSpeed', 0.5, 3, 0.1).name('Jalan').onChange((v: number) => {
    MOVE.walkSpeed = v;
  });
  movement.add(params, 'runSpeed', 1, 6, 0.1).name('Lari').onChange((v: number) => {
    MOVE.runSpeed = v;
  });
  movement.add(params, 'turnRate', 2, 20, 0.5).name('Belok').onChange((v: number) => {
    MOVE.turnRate = v;
  });

  const gait = gui.addFolder('Gait');
  gait.add(params, 'stepHeight', 0.02, 0.4, 0.01).name('Angkat kaki').onChange((v: number) => {
    GAIT.stepHeight = v;
  });
  gait.add(params, 'strideWalk', 0.25, 1.2, 0.05).name('Langkah').onChange((v: number) => {
    GAIT.strideLengthWalk = v;
  });
  gait.add(params, 'armSwing', 0, 1.2, 0.05).name('Ayun lengan').onChange((v: number) => {
    GAIT.armSwingAmount = v;
  });

  const cam = gui.addFolder('Kamera');
  cam.add(params, 'cameraDistance', 2.5, 10, 0.1).name('Jarak').onChange((v: number) => {
    KID.cameraDistance = v;
  });
  cam.add(params, 'cameraPitch', -20, 55, 1).name('Kemiringan').onChange((v: number) => {
    KID.cameraPitchDeg = v;
  });

  gui.add(params, 'backToSpawn').name('Kembali ke spawn');
  gui.add(params, 'tidyToys').name('Rapikan mainan');

  return {
    destroy: () => gui.destroy(),
  };
}
