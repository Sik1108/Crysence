import { RECORDING_DURATION_SECONDS } from "./constants.js";

export class RecordingCountdown {
  constructor({
    durationSeconds = RECORDING_DURATION_SECONDS,
    onTick = () => {},
    onComplete = () => {},
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
  } = {}) {
    this.durationSeconds = durationSeconds;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.remaining = durationSeconds;
    this.intervalId = null;
    this.completed = false;
  }

  start() {
    this.stop();
    this.completed = false;
    this.remaining = this.durationSeconds;
    this.onTick(this.remaining);
    this.intervalId = this.setIntervalFn(() => this.tick(), 1000);
    return this;
  }

  tick() {
    if (this.completed) return;
    this.remaining = Math.max(0, this.remaining - 1);
    this.onTick(this.remaining);
    if (this.remaining === 0) {
      this.completed = true;
      this.stop();
      this.onComplete();
    }
  }

  stop() {
    if (this.intervalId !== null) {
      this.clearIntervalFn(this.intervalId);
      this.intervalId = null;
    }
  }
}
