import { RECORDING_DURATION_SECONDS } from "./constants.js";

export class RecordingCountdown {
  constructor({
    durationSeconds = RECORDING_DURATION_SECONDS,
    onTick = () => {},
    onComplete = () => {},
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  } = {}) {
    this.durationSeconds = durationSeconds;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.remaining = durationSeconds;
    this.intervalId = null;
    this.timeoutId = null;
    this.completed = false;
  }

  start() {
    this.stop();
    this.completed = false;
    this.remaining = this.durationSeconds;
    this.onTick(this.remaining);
    this.intervalId = this.setIntervalFn(() => this.tick(), 1000);
    this.timeoutId = this.setTimeoutFn(() => this.complete(), this.durationSeconds * 1000);
    return this;
  }

  tick() {
    if (this.completed) return;
    this.remaining = Math.max(0, this.remaining - 1);
    this.onTick(this.remaining);
    if (this.remaining === 0) this.complete();
  }

  complete() {
    if (this.completed) return;
    this.completed = true;
    if (this.remaining !== 0) {
      this.remaining = 0;
      this.onTick(0);
    }
    this.stop();
    this.onComplete();
  }

  stop() {
    if (this.intervalId !== null) {
      this.clearIntervalFn(this.intervalId);
      this.intervalId = null;
    }
    if (this.timeoutId !== null) {
      this.clearTimeoutFn(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
