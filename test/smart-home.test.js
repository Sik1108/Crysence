import test from "node:test";
import assert from "node:assert/strict";
import { CRY_REASONS, SAFETY_STATUS } from "../src/constants.js";
import {
  DEVICE_STATUS,
  MockSmartHomeAdapter,
  PLAN_STATUS,
  UserConsent,
  buildAutomationPlan,
  createMockDevices,
  createSafeResult,
  isAutomationAllowed
} from "../src/smart-home.js";

function safeAnalysis(overrides = {}) {
  return {
    id: "analysis-test",
    cryReason: CRY_REASONS.SLEEPY,
    confidence: 0.82,
    classificationReliable: true,
    safetyResult: createSafeResult(),
    context: { temperature: 25.8, humidity: 46 },
    ...overrides
  };
}

test("safe high-confidence sleepy result creates a reason-linked plan", () => {
  const plan = buildAutomationPlan(safeAnalysis(), createMockDevices());
  assert.equal(plan.status, PLAN_STATUS.AWAITING_CONSENT);
  assert.ok(plan.actions.some(action => action.capabilityId === "crib.rocking"));
  assert.ok(plan.actions.some(action => action.capabilityId === "light.scene"));
  assert.ok(plan.actions.some(action => action.capabilityId === "climate.temperature"));
});

test("plan keeps showing suggested states when devices are already optimal", () => {
  const devices = createMockDevices();
  Object.assign(devices.find(device => device.id === "smart-crib").state, { rocking: true, intensity: "low" });
  Object.assign(devices.find(device => device.id === "nursery-light").state, { on: true, brightness: 20, colorTemperature: 2700 });
  Object.assign(devices.find(device => device.id === "nursery-climate").state, { currentTemperature: 24 });
  Object.assign(devices.find(device => device.id === "white-noise").state, { on: true, volume: 18 });
  const plan = buildAutomationPlan(safeAnalysis({ context: { temperature: 24, humidity: 46 } }), devices);

  assert.equal(plan.status, PLAN_STATUS.AWAITING_CONSENT);
  assert.ok(plan.actions.length >= 4);
  assert.ok(plan.actions.every(action => action.alreadyOptimal));
  assert.ok(plan.actions.every(action => action.enabled === false));
});

test("pathological, abnormal, danger-sign and low-confidence results block automation", () => {
  const unsafeCases = [
    safeAnalysis({ safetyResult: { ...createSafeResult(), status: SAFETY_STATUS.PATHOLOGICAL_RISK, pathologicalRisk: true } }),
    safeAnalysis({ safetyResult: { ...createSafeResult(), status: SAFETY_STATUS.ABNORMAL_CRY, abnormalCry: true } }),
    safeAnalysis({ safetyResult: { ...createSafeResult(), status: SAFETY_STATUS.DANGER_SIGNS, dangerSigns: true } }),
    safeAnalysis({ confidence: 0.54, classificationReliable: false, safetyResult: { ...createSafeResult(), status: SAFETY_STATUS.LOW_CONFIDENCE, classificationReliable: false } })
  ];

  for (const analysis of unsafeCases) {
    assert.equal(isAutomationAllowed(analysis), false);
    assert.equal(buildAutomationPlan(analysis, createMockDevices()).status, PLAN_STATUS.BLOCKED);
  }
});

test("adapter sends no command without explicit consent", async () => {
  const adapter = new MockSmartHomeAdapter();
  const plan = buildAutomationPlan(safeAnalysis(), adapter.listDevices());
  const result = await adapter.executePlan(plan, null);
  assert.equal(result.reason, "consent_required");
  assert.equal(adapter.commandLog.length, 0);
});

test("granted consent cannot bypass a safety-blocked plan", async () => {
  const adapter = new MockSmartHomeAdapter();
  const plan = buildAutomationPlan(safeAnalysis({
    safetyResult: { ...createSafeResult(), status: SAFETY_STATUS.ABNORMAL_CRY, abnormalCry: true }
  }), adapter.listDevices());
  const consent = new UserConsent({ planId: plan.id, granted: true, actionIds: [] });
  const result = await adapter.executePlan(plan, consent);

  assert.equal(result.reason, "plan_blocked_by_safety_gate");
  assert.equal(adapter.commandLog.length, 0);
});

test("consent executes selected available actions and changes mock device state", async () => {
  const adapter = new MockSmartHomeAdapter();
  const plan = buildAutomationPlan(safeAnalysis(), adapter.listDevices());
  const available = plan.actions.filter(action => action.enabled).map(action => action.id);
  const consent = new UserConsent({ planId: plan.id, granted: true, actionIds: available });
  const result = await adapter.executePlan(plan, consent);

  assert.equal(result.status, PLAN_STATUS.COMPLETED);
  assert.equal(adapter.listDevices().find(device => device.id === "smart-crib").state.rocking, true);
  assert.equal(adapter.listDevices().find(device => device.id === "nursery-light").state.brightness, 20);
});

test("single command failure is isolated and produces partial failure", async () => {
  const devices = createMockDevices();
  const plan = buildAutomationPlan(safeAnalysis(), devices);
  const available = plan.actions.filter(action => action.enabled);
  const adapter = new MockSmartHomeAdapter({ devices, failActionIds: [available[1].id] });
  const consent = new UserConsent({ planId: plan.id, granted: true, actionIds: available.map(action => action.id) });
  const result = await adapter.executePlan(plan, consent);

  assert.equal(result.status, PLAN_STATUS.PARTIAL_FAILED);
  assert.equal(result.results.filter(item => item.status === "completed").length, available.length - 1);
  assert.equal(result.results.filter(item => item.status === "failed").length, 1);
});

test("offline device failure is isolated while remaining devices execute", async () => {
  const adapter = new MockSmartHomeAdapter();
  adapter.listDevices().find(device => device.id === "nursery-climate").status = DEVICE_STATUS.OFFLINE;
  const plan = buildAutomationPlan(safeAnalysis(), adapter.listDevices());
  const offlineAction = plan.actions.find(action => action.deviceStatus === "offline");
  const availableAction = plan.actions.find(action => action.enabled);
  const consent = new UserConsent({
    planId: plan.id,
    granted: true,
    actionIds: [availableAction.id, offlineAction.id]
  });
  const result = await adapter.executePlan(plan, consent);

  assert.equal(result.status, PLAN_STATUS.PARTIAL_FAILED);
  assert.equal(result.results.find(item => item.actionId === offlineAction.id).reason, "offline");
  assert.equal(result.results.find(item => item.actionId === availableAction.id).status, "completed");
});

test("hunger never recommends crib rocking", () => {
  const plan = buildAutomationPlan(safeAnalysis({ cryReason: CRY_REASONS.HUNGER }), createMockDevices());
  assert.ok(plan.actions.every(action => action.capabilityId !== "crib.rocking"));
  assert.ok(plan.actions.some(action => action.capabilityId === "light.scene"));
});

test("discomfort always explains the environment plan and only enables supported changes", () => {
  const coolRoom = buildAutomationPlan(safeAnalysis({ cryReason: CRY_REASONS.DISCOMFORT, context: { temperature: 23.5, humidity: 46 } }), createMockDevices());
  const hotRoom = buildAutomationPlan(safeAnalysis({ cryReason: CRY_REASONS.DISCOMFORT, context: { temperature: 26.2, humidity: 46 } }), createMockDevices());
  assert.ok(coolRoom.actions.some(action => action.capabilityId === "climate.temperature" && action.alreadyOptimal));
  assert.ok(hotRoom.actions.some(action => action.capabilityId === "climate.temperature" && action.enabled));
});
