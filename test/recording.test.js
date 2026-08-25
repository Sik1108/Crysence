import test from "node:test";
import assert from "node:assert/strict";
import { RecordingCountdown } from "../src/recording.js";
import { RECORDING_DURATION_SECONDS } from "../src/constants.js";

test("recording countdown uses five seconds and completes automatically", () => {
  let scheduled;
  const ticks = [];
  let completions = 0;
  const countdown = new RecordingCountdown({
    onTick: value => ticks.push(value),
    onComplete: () => { completions += 1; },
    setIntervalFn: callback => { scheduled = callback; return 9; },
    clearIntervalFn: () => {}
  });

  countdown.start();
  for (let index = 0; index < RECORDING_DURATION_SECONDS; index += 1) scheduled();

  assert.equal(RECORDING_DURATION_SECONDS, 5);
  assert.deepEqual(ticks, [5, 4, 3, 2, 1, 0]);
  assert.equal(completions, 1);
});
