import {
  CRY_REASONS,
  RELIABLE_CONFIDENCE_THRESHOLD,
  SAFETY_STATUS
} from "./constants.js";

export const DEVICE_STATUS = Object.freeze({
  ONLINE: "online",
  OFFLINE: "offline",
  UNAUTHORIZED: "unauthorized",
  CONNECTED: "connected"
});

export const PLAN_STATUS = Object.freeze({
  BLOCKED: "blocked",
  AWAITING_CONSENT: "awaiting_consent",
  EXECUTING: "executing",
  COMPLETED: "completed",
  PARTIAL_FAILED: "partial_failed",
  FAILED: "failed",
  CANCELLED: "cancelled"
});

export class Capability {
  constructor({ id, type, parameters = {} }) {
    this.id = id;
    this.type = type;
    this.parameters = { ...parameters };
  }
}

export class Device {
  constructor({ id, name, category, status, room = "婴儿房", capabilities = [], state = {}, automationEnabled = true }) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.status = status;
    this.room = room;
    this.capabilities = capabilities.map(capability => capability instanceof Capability
      ? capability
      : new Capability(capability));
    this.state = { ...state };
    this.automationEnabled = automationEnabled;
  }
}

export class SuggestedAction {
  constructor({
    id,
    deviceId,
    capabilityId,
    label,
    detail,
    parameters,
    durationSeconds = null,
    reason,
    deviceStatus,
    enabled = true,
    alreadyOptimal = false,
    requiresExecution = true
  }) {
    this.id = id;
    this.deviceId = deviceId;
    this.capabilityId = capabilityId;
    this.label = label;
    this.detail = detail;
    this.parameters = { ...parameters };
    this.durationSeconds = durationSeconds;
    this.reason = reason;
    this.deviceStatus = deviceStatus;
    this.enabled = enabled;
    this.alreadyOptimal = alreadyOptimal;
    this.requiresExecution = requiresExecution;
  }
}

export class AutomationPlan {
  constructor({ id, analysisId, reason, actions = [], status, blockedReason = null }) {
    this.id = id;
    this.analysisId = analysisId;
    this.reason = reason;
    this.actions = actions;
    this.status = status;
    this.blockedReason = blockedReason;
    this.createdAt = new Date().toISOString();
  }
}

export class UserConsent {
  constructor({ planId, granted, actionIds = [], source = "confirmation_sheet" }) {
    this.planId = planId;
    this.granted = granted === true;
    this.actionIds = [...actionIds];
    this.source = source;
    this.timestamp = new Date().toISOString();
  }
}

export class ExecutionResult {
  constructor({ planId, status, results = [], reason = null, startedAt, completedAt }) {
    this.planId = planId;
    this.status = status;
    this.results = results;
    this.reason = reason;
    this.startedAt = startedAt;
    this.completedAt = completedAt;
  }
}

export class SmartHomeAdapter {
  listDevices() {
    throw new Error("SmartHomeAdapter.listDevices() must be implemented");
  }

  executePlan() {
    throw new Error("SmartHomeAdapter.executePlan() must be implemented");
  }
}

export function createSafeResult() {
  return {
    status: SAFETY_STATUS.SAFE,
    pathologicalRisk: false,
    abnormalCry: false,
    dangerSigns: false,
    classificationReliable: true
  };
}

export function isAutomationAllowed(analysis) {
  const safety = analysis?.safetyResult;
  return Boolean(
    analysis
    && safety
    && safety.status === SAFETY_STATUS.SAFE
    && safety.pathologicalRisk === false
    && safety.abnormalCry === false
    && safety.dangerSigns === false
    && safety.classificationReliable === true
    && analysis.classificationReliable === true
    && analysis.confidence >= RELIABLE_CONFIDENCE_THRESHOLD
  );
}

function actionMatchesCurrentState(device, config) {
  const target = config.parameters || {};
  if (config.capabilityId === "crib.rocking") {
    return device.state.rocking === target.on && device.state.intensity === target.intensity;
  }
  if (config.capabilityId === "light.scene") {
    return device.state.on === target.on
      && Math.abs((device.state.brightness ?? 0) - (target.brightness ?? 0)) <= 2
      && Math.abs((device.state.colorTemperature ?? 0) - (target.colorTemperature ?? 0)) <= 100;
  }
  if (config.capabilityId === "climate.temperature") {
    return Math.abs((device.state.currentTemperature ?? 0) - (target.targetTemperature ?? 0)) <= 0.5;
  }
  if (config.capabilityId === "humidifier.target") {
    return device.state.on === target.on
      && Math.abs((device.state.currentHumidity ?? 0) - (target.targetHumidity ?? 0)) <= 3;
  }
  if (config.capabilityId === "audio.white_noise") {
    return device.state.on === target.on && Math.abs((device.state.volume ?? 0) - (target.volume ?? 0)) <= 2;
  }
  return false;
}

function actionFor(devicesById, config) {
  const device = devicesById.get(config.deviceId);
  if (!device) return null;
  const requiresExecution = config.requiresExecution !== false;
  const alreadyOptimal = config.alreadyOptimal ?? actionMatchesCurrentState(device, config);
  const deviceAvailable = device.status === DEVICE_STATUS.ONLINE || device.status === DEVICE_STATUS.CONNECTED;
  return new SuggestedAction({
    ...config,
    deviceStatus: device.status,
    requiresExecution,
    alreadyOptimal,
    enabled: deviceAvailable && device.automationEnabled && requiresExecution && !alreadyOptimal
  });
}

export function buildAutomationPlan(analysis, devices) {
  const planId = `plan-${analysis.id}`;
  if (!isAutomationAllowed(analysis)) {
    return new AutomationPlan({
      id: planId,
      analysisId: analysis.id,
      reason: analysis.cryReason,
      status: PLAN_STATUS.BLOCKED,
      blockedReason: "safety_or_confidence_gate"
    });
  }

  const devicesById = new Map(devices.map(device => [device.id, device]));
  const actions = [];
  const add = config => {
    const action = actionFor(devicesById, config);
    if (action) actions.push(action);
  };

  if (analysis.cryReason === CRY_REASONS.SLEEPY) {
    add({
      id: `${planId}-crib`, deviceId: "smart-crib", capabilityId: "crib.rocking",
      label: "轻柔摇动", detail: "低强度，持续 10 分钟",
      parameters: { on: true, intensity: "low" }, durationSeconds: 600,
      reason: "困倦哭声可通过降低刺激和规律轻摇辅助安抚"
    });
    add({
      id: `${planId}-light`, deviceId: "nursery-light", capabilityId: "light.scene",
      label: "切换睡眠灯光", detail: "亮度 20%，暖光 2700K",
      parameters: { on: true, brightness: 20, colorTemperature: 2700 },
      reason: "困倦时降低视觉刺激"
    });
    add({
      id: `${planId}-climate`, deviceId: "nursery-climate", capabilityId: "climate.temperature",
      label: "准备舒适睡眠温度", detail: `当前 ${(analysis.context?.temperature ?? 24).toFixed(1)}°C，建议 24°C`,
      parameters: { targetTemperature: 24, mode: (analysis.context?.temperature ?? 24) > 24 ? "cool" : "auto" },
      reason: "困倦时保持稳定、不过热的睡眠环境"
    });
    add({
      id: `${planId}-noise`, deviceId: "white-noise", capabilityId: "audio.white_noise",
      label: "播放白噪声", detail: "低音量，持续 10 分钟",
      parameters: { on: true, volume: 18 }, durationSeconds: 600,
      reason: "困倦时可用稳定低音量背景声降低突发刺激"
    });
  }

  if (analysis.cryReason === CRY_REASONS.HUNGER) {
    add({
      id: `${planId}-feeding-light`, deviceId: "nursery-light", capabilityId: "light.scene",
      label: "开启夜间喂养灯", detail: "亮度 35%，暖光 2700K",
      parameters: { on: true, brightness: 35, colorTemperature: 2700 },
      reason: "仅提供夜间喂养所需的柔和辅助照明"
    });
  }

  if (analysis.cryReason === CRY_REASONS.DISCOMFORT) {
    const temperature = analysis.context?.temperature ?? 24;
    const targetTemperature = temperature > 25.5 ? 24 : temperature < 21 ? 22 : temperature;
    const temperatureNeedsChange = temperature > 25.5 || temperature < 21;
    add({
      id: `${planId}-comfort-climate`, deviceId: "nursery-climate", capabilityId: "climate.temperature",
      label: temperatureNeedsChange ? "把卧室调回舒适温度" : "保持当前舒适温度",
      detail: temperatureNeedsChange ? `当前 ${temperature.toFixed(1)}°C，建议 ${targetTemperature}°C` : `当前 ${temperature.toFixed(1)}°C，温度暂时合适`,
      parameters: { targetTemperature, mode: temperature > 25.5 ? "cool" : temperature < 21 ? "heat" : "auto" },
      requiresExecution: temperatureNeedsChange,
      alreadyOptimal: !temperatureNeedsChange,
      reason: temperatureNeedsChange ? "温度传感器支持本次环境调整" : "传感器显示当前温度无需改变"
    });
    if ((analysis.context?.humidity ?? 100) < 40) {
      add({
        id: `${planId}-dry-room`, deviceId: "nursery-humidifier", capabilityId: "humidifier.target",
        label: "提高卧室湿度", detail: `当前 ${analysis.context.humidity}% RH，目标 48% RH`,
        parameters: { on: true, targetHumidity: 48 },
        reason: "只有传感器确认湿度偏低时才建议加湿"
      });
    }
  }

  return new AutomationPlan({
    id: planId,
    analysisId: analysis.id,
    reason: analysis.cryReason,
    actions,
    status: actions.length ? PLAN_STATUS.AWAITING_CONSENT : PLAN_STATUS.BLOCKED,
    blockedReason: actions.length ? null : "no_reason_linked_action"
  });
}

export function createMockDevices() {
  return [
    new Device({
      id: "smart-crib", name: "智能婴儿床", category: "crib", status: DEVICE_STATUS.ONLINE,
      capabilities: [
        { id: "crib.rocking", type: "rock", parameters: { intensity: ["low", "medium"], maxDurationSeconds: 1200 } }
      ],
      state: { rocking: false, intensity: "off", remainingSeconds: 0 }
    }),
    new Device({
      id: "nursery-light", name: "婴儿房夜灯", category: "light", status: DEVICE_STATUS.CONNECTED,
      capabilities: [
        { id: "light.scene", type: "light", parameters: { brightness: [1, 100], colorTemperature: [2200, 6500] } }
      ],
      state: { on: true, brightness: 62, colorTemperature: 3500 }
    }),
    new Device({
      id: "nursery-climate", name: "卧室温控", category: "climate", status: DEVICE_STATUS.CONNECTED,
      capabilities: [
        { id: "climate.temperature", type: "temperature", parameters: { targetTemperature: [18, 28], modes: ["auto", "cool", "heat"] } }
      ],
      state: { currentTemperature: 25.8, targetTemperature: 25, mode: "auto" }
    }),
    new Device({
      id: "nursery-sensor", name: "温湿度传感器", category: "sensor", status: DEVICE_STATUS.CONNECTED,
      capabilities: [
        { id: "sensor.environment", type: "read_only", parameters: { temperature: true, humidity: true } }
      ],
      state: { temperature: 25.8, humidity: 46 }
    }),
    new Device({
      id: "white-noise", name: "白噪声机", category: "audio", status: DEVICE_STATUS.CONNECTED,
      capabilities: [
        { id: "audio.white_noise", type: "audio", parameters: { volume: [1, 40], maxDurationSeconds: 1800 } }
      ],
      state: { on: true, volume: 18, remainingSeconds: 600 }
    }),
    new Device({
      id: "nursery-humidifier", name: "婴儿房加湿器", category: "humidifier", status: DEVICE_STATUS.CONNECTED,
      capabilities: [
        { id: "humidifier.target", type: "humidity", parameters: { targetHumidity: [40, 60] } }
      ],
      state: { on: false, currentHumidity: 46, targetHumidity: 48 }
    })
  ];
}

function applyAction(device, action) {
  if (action.capabilityId === "crib.rocking") {
    Object.assign(device.state, {
      rocking: action.parameters.on,
      intensity: action.parameters.intensity,
      remainingSeconds: action.durationSeconds
    });
  }
  if (action.capabilityId === "light.scene") {
    Object.assign(device.state, action.parameters);
  }
  if (action.capabilityId === "climate.temperature") {
    Object.assign(device.state, action.parameters);
  }
  if (action.capabilityId === "humidifier.target") {
    Object.assign(device.state, action.parameters);
  }
  if (action.capabilityId === "audio.white_noise") {
    Object.assign(device.state, action.parameters, { remainingSeconds: action.durationSeconds });
  }
}

export class MockSmartHomeAdapter extends SmartHomeAdapter {
  constructor({ devices = createMockDevices(), failActionIds = [] } = {}) {
    super();
    this.devices = devices;
    this.failActionIds = new Set(failActionIds);
    this.commandLog = [];
  }

  listDevices() {
    return this.devices;
  }

  async executePlan(plan, consent) {
    const startedAt = new Date().toISOString();
    if (!consent?.granted || consent.planId !== plan.id) {
      return new ExecutionResult({
        planId: plan.id,
        status: PLAN_STATUS.FAILED,
        reason: "consent_required",
        results: [],
        startedAt,
        completedAt: new Date().toISOString()
      });
    }
    if (plan.status === PLAN_STATUS.BLOCKED) {
      return new ExecutionResult({
        planId: plan.id,
        status: PLAN_STATUS.FAILED,
        reason: "plan_blocked_by_safety_gate",
        results: [],
        startedAt,
        completedAt: new Date().toISOString()
      });
    }

    plan.status = PLAN_STATUS.EXECUTING;
    const selected = plan.actions.filter(action => consent.actionIds.includes(action.id));
    const results = [];

    for (const action of selected) {
      const device = this.devices.find(item => item.id === action.deviceId);
      if (!device || device.status === DEVICE_STATUS.OFFLINE || device.status === DEVICE_STATUS.UNAUTHORIZED || device.automationEnabled === false) {
        results.push({
          actionId: action.id,
          deviceId: action.deviceId,
          status: "failed",
          reason: !device ? "device_missing" : device.automationEnabled === false ? "automation_disabled" : device.status
        });
        continue;
      }

      this.commandLog.push({ actionId: action.id, deviceId: device.id, sentAt: new Date().toISOString() });
      if (this.failActionIds.has(action.id)) {
        results.push({ actionId: action.id, deviceId: device.id, status: "failed", reason: "mock_command_failure" });
        continue;
      }

      applyAction(device, action);
      results.push({ actionId: action.id, deviceId: device.id, status: "completed" });
    }

    const completedCount = results.filter(result => result.status === "completed").length;
    const failedCount = results.filter(result => result.status === "failed").length;
    const status = completedCount && failedCount
      ? PLAN_STATUS.PARTIAL_FAILED
      : completedCount
        ? PLAN_STATUS.COMPLETED
        : PLAN_STATUS.FAILED;
    plan.status = status;

    return new ExecutionResult({
      planId: plan.id,
      status,
      results,
      startedAt,
      completedAt: new Date().toISOString()
    });
  }
}

export const FUTURE_SMART_HOME_ADAPTERS = Object.freeze([
  "Matter",
  "Apple Home / HomeKit",
  "Home Assistant",
  "小米 IoT",
  "厂商 SDK"
]);
