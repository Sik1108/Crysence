import test from "node:test";
import assert from "node:assert/strict";
import { RecordingCountdown } from "../src/recording.js";
import { RECORDING_DURATION_SECONDS } from "../src/constants.js";

test("recording countdown uses five seconds and completes automatically", () => {
  let scheduled;
  let hardStop;
  const ticks = [];
  let completions = 0;
  const countdown = new RecordingCountdown({
    onTick: value => ticks.push(value),
    onComplete: () => { completions += 1; },
    setIntervalFn: callback => { scheduled = callback; return 9; },
    clearIntervalFn: () => {},
    setTimeoutFn: callback => { hardStop = callback; return 10; },
    clearTimeoutFn: () => {}
  });

  countdown.start();
  for (let index = 0; index < RECORDING_DURATION_SECONDS; index += 1) scheduled();

  assert.equal(RECORDING_DURATION_SECONDS, 5);
  assert.deepEqual(ticks, [5, 4, 3, 2, 1, 0]);
  assert.equal(completions, 1);
  hardStop();
  assert.equal(completions, 1);
});

test("five-second hard stop completes even when interval ticks are throttled", () => {
  let hardStop;
  const ticks = [];
  let completions = 0;
  const countdown = new RecordingCountdown({
    onTick: value => ticks.push(value),
    onComplete: () => { completions += 1; },
    setIntervalFn: () => 11,
    clearIntervalFn: () => {},
    setTimeoutFn: callback => { hardStop = callback; return 12; },
    clearTimeoutFn: () => {}
  });

  countdown.start();
  hardStop();

  assert.deepEqual(ticks, [5, 0]);
  assert.equal(completions, 1);
  assert.equal(countdown.completed, true);
});
