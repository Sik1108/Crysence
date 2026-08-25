import test from "node:test";
import assert from "node:assert/strict";
import { AnalysisStore, MemoryStorage } from "../src/analysis-store.js";
import { createSafeResult } from "../src/smart-home.js";

test("analysis feedback loop persists the required fields", () => {
  const store = new AnalysisStore(new MemoryStorage());
  store.save({
    id: "analysis-1",
    cryReason: "sleepy",
    probabilityDistribution: { hunger: 0.16, sleepy: 0.78, discomfort: 0.06 },
    confidence: 0.78,
    safetyResult: createSafeResult(),
    recommendedActions: [{ id: "light-action" }]
  });
  store.recordConsent("analysis-1", { granted: true, actionIds: ["light-action"] });
  store.recordExecution("analysis-1", { status: "completed", results: [{ actionId: "light-action", status: "completed" }] });
  store.recordFeedback("analysis-1", { userFeedback: "baby_calmed", interventionEffective: true });

  const record = store.get("analysis-1");
  assert.equal(record.cryReason, "sleepy");
  assert.equal(record.userConsent.granted, true);
  assert.deepEqual(record.executedActions, ["light-action"]);
  assert.equal(record.executionResult.status, "completed");
  assert.equal(record.userFeedback, "baby_calmed");
  assert.equal(record.interventionEffective, true);
  assert.match(record.medicalUsePolicy, /excluded from medical diagnosis/i);
});
