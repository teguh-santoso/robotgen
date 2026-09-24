import { Scene } from 'three';
import { DEBUG } from './Config';
import { Loop } from './Loop';
import type { Frame } from './Loop';
import { Quality } from './Quality';
import { Renderer } from './Renderer';
import { Environment } from '../world/Environment';
import { Playground } from '../world/Playground';
import { ShapeFactory } from '../world/ShapeFactory';
import { PhysicsDebug } from '../physics/PhysicsDebug';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { loadRapier } from '../physics/rapier';
import type { RapierModule } from '../physics/rapier';
import { RobotController } from '../robot/RobotController';
import { FollowCamera } from '../camera/FollowCamera';
import { Stars } from '../game/Stars';
import { Toys } from '../game/Toys';
import { Celebration } from '../game/Celebration';
import { InputManager } from '../input/InputManager';
import { KeyboardDevice } from '../input/KeyboardDevice';
import { GamepadDevice } from '../input/GamepadDevice';
import { TouchDevice } from '../input/TouchDevice';
import { Sfx } from '../audio/Sfx';
import { Hud } from '../ui/Hud';
import { PauseOverlay } from '../ui/PauseOverlay';
import { CompleteOverlay } from '../ui/CompleteOverlay';
import { el } from '../ui/dom';
import type { StartScreen } from '../ui/StartScreen';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  startScreen: StartScreen;
  sfx: Sfx;
  onProgress: (fraction: number) => void;
}

type Phase = 'playing' | 'celebrating' | 'complete';

const FADE_SECONDS = 0.36;
const CELEBRATION_SECONDS = 4.6;

/**
 * Owns the world and drives the frame. Loading Rapier is deferred until the
 * child has pressed MULAI, which keeps the first paint tiny.
 */
export class Game implements Frame {
  static async create(options: GameOptions): Promise<Game> {
    options.onProgress(0.15);
    const R = await loadRapier();
    options.onProgress(0.75);
    return new Game(R, options);
  }

  private readonly scene = new Scene();
  private readonly renderer: Renderer;
  private readonly quality: Quality;
  private readonly environment: Environment;
  private readonly physics: PhysicsWorld;
  private readonly factory: ShapeFactory;
  private readonly playground: Playground;
  private readonly robot: RobotController;
  private readonly stars: Stars;
  private readonly toys: Toys;
  private readonly celebration: Celebration;
  private readonly camera: FollowCamera;
  private readonly input = new InputManager();
  private readonly keyboard: KeyboardDevice;
  private readonly gamepad: GamepadDevice;
  private readonly touch: TouchDevice;
  private readonly hud: Hud;
  private readonly pauseOverlay: PauseOverlay;
  private readonly completeOverlay: CompleteOverlay;
  private readonly loop: Loop;
  private readonly curtain: HTMLDivElement;
  private readonly physicsDebug: PhysicsDebug | null;

  private readonly sfx: Sfx;
  private readonly startScreen: StartScreen;

  private phase: Phase = 'playing';
  private celebrationTimer = 0;
  private fading: 'none' | 'out' | 'in' = 'none';
  private fadeTimer = 0;
  private gamepadWasConnected = false;
  private smokeTestDone = false;
  private frameDt = 1 / 60;
  private disposeDebug: (() => void) | null = null;

  private constructor(
    R: RapierModule,
    options: GameOptions,
  ) {
    this.sfx = options.sfx;
    this.startScreen = options.startScreen;

    this.renderer = new Renderer(options.canvas);
    this.quality = new Quality(this.renderer);
    this.environment = new Environment(this.scene, this.renderer.renderer);

    this.physics = new PhysicsWorld(R);
    this.factory = new ShapeFactory(this.physics, R);
    this.playground = new Playground(this.scene, this.factory);

    const spawn = this.playground.spawnPoint;
    this.robot = new RobotController(R, this.physics, spawn, this.playground.spawnYaw);
    this.scene.add(this.robot.rig.root);

    this.stars = new Stars(this.scene, this.playground.starAnchors);
    this.toys = new Toys(this.factory, this.physics, R);
    this.toys.build();
    this.scene.add(this.toys.group);
    this.celebration = new Celebration(this.scene);

    this.camera = new FollowCamera(window.innerWidth / Math.max(window.innerHeight, 1));
    this.camera.reset(spawn, this.playground.spawnYaw);

    this.keyboard = new KeyboardDevice();
    this.gamepad = new GamepadDevice();
    this.touch = new TouchDevice(options.uiRoot);
    this.input.add(this.keyboard);
    this.input.add(this.gamepad);
    this.input.add(this.touch);

    this.hud = new Hud(options.uiRoot, {
      onPause: () => this.togglePause(),
      onToggleSound: () => {
        this.sfx.setMuted(!this.sfx.isMuted);
        return this.sfx.isMuted;
      },
    });
    this.pauseOverlay = new PauseOverlay(options.uiRoot, {
      onResume: () => this.setPaused(false),
      onRestart: () => this.restart(),
      onTidyToys: () => this.toys.resetAll(),
      onToggleSound: () => {
        this.sfx.setMuted(!this.sfx.isMuted);
        return this.sfx.isMuted;
      },
      onToggleRumble: () => {
        this.gamepad.rumbleEnabled = !this.gamepad.rumbleEnabled;
        return this.gamepad.rumbleEnabled;
      },
    });
    this.completeOverlay = new CompleteOverlay(options.uiRoot, () => this.restart());

    this.curtain = el('div', 'fade-curtain');
    options.uiRoot.append(this.curtain);

    this.physicsDebug = DEBUG ? new PhysicsDebug(this.physics, this.scene) : null;

    this.loop = new Loop(this);
    this.wireGameplay();
    this.hud.setStars(0, this.stars.total);
    this.completeOverlay.setStars(0, this.stars.total);
    this.resize();

    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private wireGameplay(): void {
    this.stars.onCollected = (collected, total) => {
      this.hud.setStars(collected, total);
      this.sfx.star(collected - 1);
      this.gamepad.rumble('star');
    };
    this.stars.onComplete = () => this.beginCelebration();

    this.robot.onFootstep = () => {
      this.sfx.footstep();
      this.gamepad.rumble('footstep');
    };
    this.robot.onJump = () => this.sfx.jump();
    this.robot.onLand = () => this.sfx.land();
  }

  // --- lifecycle ---------------------------------------------------------

  async play(): Promise<void> {
    this.startScreen.hide();
    this.hud.showHint('Ayo kumpulkan semua bintang!', 4);
    if (DEBUG) {
      const { createDebugPanel } = await import('../ui/DebugPanel');
      const panel = await createDebugPanel({
        robot: this.robot,
        camera: this.camera,
        physicsDebug: this.physicsDebug!,
        onTidyToys: () => this.toys.resetAll(),
      });
      this.disposeDebug = panel.destroy;
    }
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.disposeDebug?.();
    this.input.dispose();
    this.stars.dispose();
    this.toys.dispose();
    this.celebration.dispose();
    this.playground.dispose();
    this.factory.dispose();
    this.physicsDebug?.dispose();
    this.environment.dispose();
    this.physics.dispose();
    this.renderer.dispose();
  }

  // --- frame -------------------------------------------------------------

  sample(): void {
    this.input.sample();
    const state = this.input.state;

    if (state.pause) this.togglePause();

    // Losing the pad mid-game is confusing, so stop and say so kindly.
    const connected = this.input.gamepadConnected;
    if (this.gamepadWasConnected && !connected && !this.loop.isPaused) {
      this.pauseOverlay.setMessage('Controllernya terlepas. Colok lagi lalu tekan LANJUT.');
      this.setPaused(true);
    }
    this.gamepadWasConnected = connected;

    if (state.activeDevice !== 'none') {
      this.hud.setDevice(state.activeLabel, true);
    }
  }

  fixedUpdate(dt: number): void {
    const state = this.input.state;
    const locked = this.phase !== 'playing';

    this.robot.prePhysics(
      dt,
      state.moveX,
      state.moveY,
      state.jump,
      this.camera.movementYaw,
      locked,
    );

    this.physics.step();

    this.robot.postPhysics(dt);
    this.stars.fixedUpdate(dt, this.robot.body.position);
    this.toys.fixedUpdate();
    this.physics.syncMeshes();

    if (this.robot.hasFallen && this.fading === 'none') this.beginFade();
    this.updateFade(dt);
    this.maybeSmokeTest();
  }

  renderUpdate(alpha: number, dt: number): void {
    this.frameDt = dt;
    this.celebration.update(dt);

    this.robot.renderUpdate(alpha, dt);
    this.stars.renderUpdate(dt);

    this.camera.update(
      dt,
      this.input.state.orbitX,
      this.input.state.orbitY,
      this.robot.body.position,
      this.robot.body.yaw,
      this.physics,
      this.robot.body.body,
    );

    if (this.physicsDebug?.lines.visible) this.physicsDebug.update();
    this.quality.update(dt);
    this.hud.update(dt, 1 / Math.max(dt, 1e-4));

    if (this.phase === 'celebrating') {
      this.celebrationTimer -= dt;
      if (this.celebrationTimer <= 0) this.showCompleteOverlay();
    }

    this.renderer.renderer.render(this.scene, this.camera.camera);
  }

  private resize = (): void => {
    const width = window.innerWidth;
    const height = Math.max(window.innerHeight, 1);
    this.renderer.setSize(width, height);
    this.camera.resize(width / height);
  };

  private onVisibility = (): void => {
    if (document.hidden && this.phase === 'playing') {
      this.pauseOverlay.setMessage('Tekan LANJUT kalau sudah siap.');
      this.setPaused(true);
    }
  };

  // --- game states -------------------------------------------------------

  private setPaused(paused: boolean): void {
    if (paused && this.phase !== 'playing') return;
    this.pauseOverlay.hide();
    if (paused) this.pauseOverlay.show();
    this.loop.setPaused(paused);
  }

  private togglePause(): void {
    if (this.phase !== 'playing') return;
    this.setPaused(!this.loop.isPaused);
  }

  private beginCelebration(): void {
    this.phase = 'celebrating';
    this.celebrationTimer = CELEBRATION_SECONDS;
    this.celebration.start(this.robot.body.position);
    this.robot.startDance();
    this.sfx.complete();
    this.hud.showHint('Semua bintang terkumpul!', CELEBRATION_SECONDS);
  }

  private showCompleteOverlay(): void {
    this.phase = 'complete';
    this.robot.stopDance();
    this.completeOverlay.setStars(this.stars.collected, this.stars.total);
    this.completeOverlay.show();
    this.hud.hideHint();
    this.loop.setPaused(true);
  }

  private restart(): void {
    this.phase = 'playing';
    this.celebrationTimer = 0;
    this.pauseOverlay.hide();
    this.completeOverlay.hide();
    this.curtain.classList.remove('active');
    this.fading = 'none';
    this.celebration.stop();
    this.robot.resetToSpawn();
    this.stars.reset();
    this.toys.resetAll();
    this.camera.reset(this.robot.body.position, this.robot.body.yaw);
    this.hud.setStars(0, this.stars.total);
    this.hud.showHint('Ayo kumpulkan semua bintang!', 3);
    this.loop.setPaused(false);
  }

  // --- fall recovery -----------------------------------------------------

  private beginFade(): void {
    this.fading = 'out';
    this.fadeTimer = 0;
    this.curtain.classList.add('active');
  }

  private updateFade(dt: number): void {
    if (this.fading === 'none') return;
    this.fadeTimer += dt;
    if (this.fading === 'out' && this.fadeTimer >= FADE_SECONDS) {
      this.robot.respawn();
      this.camera.reset(this.robot.body.position, this.robot.body.yaw);
      this.sfx.respawn();
      this.fading = 'in';
      this.fadeTimer = 0;
      this.curtain.classList.remove('active');
    } else if (this.fading === 'in' && this.fadeTimer >= FADE_SECONDS) {
      this.fading = 'none';
    }
  }

  /**
   * Prints a one-off sanity report with ?debug so a run can be checked without
   * a manual walkaround.
   */
  private maybeSmokeTest(): void {
    if (!DEBUG || this.smokeTestDone) return;
    this.smokeTestDone = true;
    console.info('[robotgen] siap', {
      colliders: this.physics.world.colliders.len(),
      bodies: this.physics.world.bodies.len(),
      stars: this.stars.total,
      fps: (1 / this.frameDt).toFixed(0),
    });
  }
}
