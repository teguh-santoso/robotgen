export const FIXED_DT = 1 / 60;

export interface Frame {
  /** Runs once per rendered frame, even while paused. Never blocks input. */
  sample(): void;
  /** Runs a whole number of times per frame with a constant dt. */
  fixedUpdate(dt: number): void;
  /** Runs once per rendered frame with the leftover fraction between ticks. */
  renderUpdate(alpha: number, dt: number): void;
}

/**
 * Fixed timestep accumulator. Physics stays deterministic while rendering runs
 * at whatever rate the display offers, interpolating the leftover fraction.
 */
export class Loop {
  private lastTime = performance.now();
  private accumulator = 0;
  private running = false;
  private rafId = 0;
  private paused = false;

  constructor(private readonly frame: Frame) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    // Drop the accumulated time so unpausing does not fast-forward the world.
    this.accumulator = 0;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const frameDt = Math.min((now - this.lastTime) / 1000, 0.2);
    this.lastTime = now;

    // Sampled every frame so the pause button keeps working while paused.
    this.frame.sample();

    if (!this.paused) {
      this.accumulator += frameDt;
      while (this.accumulator >= FIXED_DT) {
        this.frame.fixedUpdate(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
    }

    this.frame.renderUpdate(this.paused ? 1 : this.accumulator / FIXED_DT, frameDt);
  };
}
