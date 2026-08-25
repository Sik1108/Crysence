import {
  CRY_REASONS,
  RECORDING_DURATION_SECONDS,
  SAFETY_STATUS,
  classifyConfidence
} from "./src/constants.js";
import { RecordingCountdown } from "./src/recording.js";
import {
  DEVICE_STATUS,
  FUTURE_SMART_HOME_ADAPTERS,
  MockSmartHomeAdapter,
  PLAN_STATUS,
  UserConsent,
  buildAutomationPlan,
  createSafeResult
} from "./src/smart-home.js";
import { AnalysisStore } from "./src/analysis-store.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const EVENT_META = {
  feeding: { icon: "喂", label: "喂养", className: "feeding" },
  sleep: { icon: "睡", label: "睡眠", className: "sleep" },
  diaper: { icon: "尿", label: "尿布", className: "diaper" },
  cry: { icon: "听", label: "哭声分析", className: "cry" },
  soothing: { icon: "安", label: "安抚反馈", className: "soothing" },
  automation: { icon: "家", label: "环境方案", className: "automation" },
  safety: { icon: "!", label: "安全分流", className: "safety" },
  temperature: { icon: "温", label: "体温", className: "temperature" },
  note: { icon: "记", label: "家庭备注", className: "note" }
};

const FLOW_KEY = "crysense-app-flow-v3";
const PERMISSION_KEY = "crysense-permissions-v3";

function parseStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const seedEvents = [
  { id: 1, type: "diaper", at: minutesAgo(48), title: "更换尿布", detail: "湿尿布，皮肤状态正常", tags: ["湿", "已清洁"], author: "爸爸" },
  { id: 2, type: "feeding", at: minutesAgo(120), title: "奶瓶喂养", detail: "配方奶 120 ml，喂养后已拍嗝", tags: ["120 ml", "已拍嗝"], author: "爸爸" },
  { id: 3, type: "sleep", at: minutesAgo(206), title: "午睡结束", detail: "睡眠 1 小时 12 分，醒来状态平稳", tags: ["1 小时 12 分", "自然醒"], author: "妈妈" },
  { id: 4, type: "soothing", at: minutesAgo(292), title: "抱哄后明显缓解", detail: "降低光线并抱哄，约 6 分钟后平静", tags: ["抱哄", "明显缓解"], author: "妈妈" },
  { id: 5, type: "cry", at: minutesAgo(300), title: "哭声分析：更可能困倦", detail: "采集 5 秒，模拟分析匹配度 78%", tags: ["较高置信度", "已反馈"], author: "妈妈" },
  { id: 6, type: "feeding", at: minutesAgo(425), title: "母乳喂养", detail: "左侧 12 分钟，右侧 9 分钟", tags: ["21 分钟"], author: "妈妈" },
  { id: 7, type: "sleep", at: minutesAgo(502), title: "夜间睡眠结束", detail: "本段睡眠 3 小时 2 分", tags: ["3 小时 2 分"], author: "爸爸" }
];

const smartHomeAdapter = new MockSmartHomeAdapter();
const analysisStore = new AnalysisStore(localStorage);
const flow = parseStored(FLOW_KEY, { onboardingComplete: false, loggedIn: false });
const permissions = parseStored(PERMISSION_KEY, {
  microphone: "prompt",
  home: "prompt",
  notifications: "prompt"
});

if (new URLSearchParams(location.search).get("fresh") === "1") {
  flow.onboardingComplete = false;
  flow.loggedIn = false;
  localStorage.setItem(FLOW_KEY, JSON.stringify(flow));
}

const state = {
  view: "home",
  filter: "all",
  logType: "note",
  events: parseStored("crysense-v3-events", seedEvents),
  stream: null,
  audioContext: null,
  analyser: null,
  recorder: null,
  recording: false,
  remaining: RECORDING_DURATION_SECONDS,
  animationId: null,
  levels: [],
  analysisSequence: 0,
  activeResult: null,
  safetyAnswers: {},
  safetyResult: null,
  safetyEventSaved: false,
  safetyAnalysisSaved: false,
  observationId: null,
  observationSeconds: 600,
  onboardingPage: 0,
  permissionRequest: null,
  retryActionIds: [],
  activeDeviceId: null
};

state.countdown = new RecordingCountdown({
  onTick: remaining => {
    state.remaining = remaining;
    $("#timerValue").textContent = String(remaining);
  },
  onComplete: () => finishRecording({ automatic: true })
});

const views = {
  home: $("#homeView"),
  timeline: $("#timelineView"),
  devices: $("#devicesView"),
  insights: $("#insightsView"),
  profile: $("#profileView"),
  listen: $("#listenView")
};

function persistFlow() {
  localStorage.setItem(FLOW_KEY, JSON.stringify(flow));
}

function persistPermissions() {
  localStorage.setItem(PERMISSION_KEY, JSON.stringify(permissions));
}

function showOnlyGate(target) {
  [$("#onboardingScreen"), $("#loginScreen"), $("#appShell")].forEach(screen => screen.classList.add("hidden"));
  target.classList.remove("hidden");
}

function showPostLaunchDestination() {
  $("#launchScreen").classList.add("hidden");
  if (!flow.onboardingComplete) {
    state.onboardingPage = 0;
    renderOnboarding();
    return showOnlyGate($("#onboardingScreen"));
  }
  if (!flow.loggedIn) return showOnlyGate($("#loginScreen"));
  enterApp();
}

function renderOnboarding() {
  $$('[data-onboarding-page]').forEach((page, index) => page.classList.toggle("active", index === state.onboardingPage));
  $$(".page-dots i").forEach((dot, index) => dot.classList.toggle("active", index === state.onboardingPage));
  $("#onboardingNextButton").textContent = state.onboardingPage === 2 ? "开始使用" : "继续";
}

function finishOnboarding() {
  flow.onboardingComplete = true;
  persistFlow();
  if (flow.loggedIn) enterApp();
  else showOnlyGate($("#loginScreen"));
}

function mockLogin() {
  flow.loggedIn = true;
  persistFlow();
  enterApp();
}

function enterApp() {
  showOnlyGate($("#appShell"));
  navigate("home");
  renderEverything();
}

function navigate(name) {
  if (!views[name]) return;
  state.view = name;
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("active", key === name));
  $$(".bottom-nav [data-nav]").forEach(button => button.classList.toggle("active", button.dataset.nav === name));
  $("#appShell").classList.toggle("flow-active", name === "listen");
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "timeline") {
    renderTimeline();
    renderAnalysisHistory();
  }
  if (name === "devices") renderDevices();
  if (name === "insights") renderInsights();
  if (name === "home") renderHome();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.id);
  showToast.id = setTimeout(() => toast.classList.remove("show"), 2800);
}

function openModal(modal) {
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("button:not([disabled])", modal)?.focus(), 0);
}

function closeModal(modal) {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function saveEvents() {
  localStorage.setItem("crysense-v3-events", JSON.stringify(state.events));
  renderHome();
  renderTimeline();
}

function sameDay(iso, date = new Date()) {
  return new Date(iso).toDateString() === date.toDateString();
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

function relativeTime(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时前`;
}

function iconMarkup(type) {
  const meta = EVENT_META[type] || EVENT_META.note;
  return `<span class="event-icon ${meta.className}">${meta.icon}</span>`;
}

function renderHome() {
  const todayEvents = state.events.filter(event => sameDay(event.at)).sort((a, b) => new Date(b.at) - new Date(a.at));
  const cryEvents = todayEvents.filter(event => event.type === "cry");
  $("#cryCount").textContent = String(Math.max(3, cryEvents.length));
  const analyses = analysisStore.list();
  if (analyses.length) {
    const labels = { hunger: "饥饿", sleepy: "困倦", discomfort: "一般性不适", unclassified: "未分类" };
    $("#latestReason").textContent = labels[analyses[0].cryReason] || "未分类";
    $("#latestAnalysisTime").textContent = relativeTime(analyses[0].timestamp);
  }
  $("#todayTimeline").innerHTML = todayEvents.slice(0, 4).map(event => `
    <article class="mini-event">
      ${iconMarkup(event.type)}
      <div><b>${escapeHTML(event.title)}</b><small>${escapeHTML(event.detail)}</small></div>
      <time>${formatTime(event.at)}</time>
    </article>`).join("") || `<div class="empty-state compact"><p>今天还没有记录，第一条从轻轻点一下开始。</p></div>`;
  renderHomeSmartCard();
}

function renderHomeSmartCard() {
  const devices = smartHomeAdapter.listDevices();
  const available = devices.filter(device => [DEVICE_STATUS.ONLINE, DEVICE_STATUS.CONNECTED].includes(device.status));
  const sensor = devices.find(device => device.category === "sensor");
  $("#homeConnectedCount").textContent = `${available.length} 台设备可用`;
  if (sensor) $("#homeEnvironment").textContent = `${sensor.state.temperature.toFixed(1)}°C`;
}

function renderTimeline() {
  const filtered = state.events
    .filter(event => sameDay(event.at))
    .filter(event => state.filter === "all" || event.type === state.filter)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  $("#eventCountLabel").textContent = `${filtered.length} 条记录`;
  $("#fullTimeline").innerHTML = filtered.length ? filtered.map(event => `
    <article class="full-event">
      ${iconMarkup(event.type)}
      <div class="event-main">
        <div><b>${escapeHTML(event.title)}</b><time>${formatTime(event.at)}</time></div>
        <p>${escapeHTML(event.detail)}</p>
        <div class="event-tags">${(event.tags || []).map(tag => `<span>${escapeHTML(tag)}</span>`).join("")}</div>
        <small>由${escapeHTML(event.author || "爸爸")}记录</small>
      </div>
    </article>`).join("") : `<div class="empty-state"><p>这个分类下还没有记录。</p><button class="text-button" type="button" data-empty-log>现在记录一条</button></div>`;
  $("[data-empty-log]")?.addEventListener("click", () => openLog(state.filter === "all" ? "note" : state.filter));
}

function safetyLabel(record) {
  const labels = {
    safe: "安全层已通过",
    pathological_risk: "病理风险分流",
    abnormal_cry: "异常哭声分流",
    danger_signs: "危险体征分流",
    low_confidence: "低置信度",
    unreliable: "无法可靠分类"
  };
  return labels[record.safetyResult?.status] || "状态未知";
}

function renderAnalysisHistory() {
  const records = analysisStore.list().slice(0, 6);
  const labels = { hunger: "饥饿", sleepy: "困倦", discomfort: "一般性不适", unclassified: "未分类" };
  $("#analysisHistory").innerHTML = records.length ? records.map(record => `
    <article class="analysis-history-row">
      <span class="analysis-reason">${escapeHTML(labels[record.cryReason] || "未分类")}</span>
      <div><b>${Math.round((record.confidence || 0) * 100)}% 匹配度</b><small>${escapeHTML(safetyLabel(record))}${record.executionResult ? `，环境方案${executionLabel(record.executionResult.status)}` : ""}</small></div>
      <time>${formatTime(record.timestamp)}</time>
    </article>`).join("") : `<div class="empty-state compact"><p>完成一次 5 秒检测后，结构化记录会保存在这里。</p></div>`;
}

function localTimeValue() {
  return new Date().toTimeString().slice(0, 5);
}

function openLog(type = "note") {
  state.logType = EVENT_META[type] && type !== "automation" && type !== "safety" && type !== "cry" ? type : "note";
  $("#eventTime").value = localTimeValue();
  $("#eventNote").value = "";
  renderLogFields();
  openModal($("#logModal"));
}

function renderLogFields() {
  $$("#typeSelector [data-type]").forEach(button => button.classList.toggle("active", button.dataset.type === state.logType));
  $("#logModalTitle").textContent = `记录${EVENT_META[state.logType].label}`;
  const fields = {
    feeding: `<div class="field"><span>喂养方式</span><div class="segmented"><label><input type="radio" name="feedMode" value="母乳" checked /><span>母乳</span></label><label><input type="radio" name="feedMode" value="奶瓶" /><span>奶瓶</span></label><label><input type="radio" name="feedMode" value="混合" /><span>混合</span></label></div></div><label class="field"><span>时长或奶量</span><input name="amount" placeholder="例如：15 分钟或 120 ml" value="15 分钟" /></label>`,
    sleep: `<div class="field"><span>记录状态</span><div class="segmented"><label><input type="radio" name="sleepMode" value="开始睡眠" checked /><span>开始睡眠</span></label><label><input type="radio" name="sleepMode" value="睡眠结束" /><span>睡眠结束</span></label></div></div>`,
    diaper: `<div class="field"><span>尿布类型</span><div class="segmented"><label><input type="radio" name="diaperType" value="湿" checked /><span>湿</span></label><label><input type="radio" name="diaperType" value="便" /><span>便</span></label><label><input type="radio" name="diaperType" value="湿和便" /><span>湿和便</span></label></div></div>`,
    soothing: `<label class="field"><span>安抚方式</span><select name="method"><option>抱哄并降低刺激</option><option>喂养</option><option>拍嗝或调整姿势</option><option>白噪声</option><option>更换尿布</option></select></label><div class="field"><span>宝宝是否缓解？</span><div class="segmented"><label><input type="radio" name="outcome" value="明显缓解" checked /><span>明显缓解</span></label><label><input type="radio" name="outcome" value="有一点" /><span>有一点</span></label><label><input type="radio" name="outcome" value="没有缓解" /><span>没有</span></label></div></div>`,
    temperature: `<label class="field"><span>体温</span><input type="number" name="temperature" min="34" max="43" step="0.1" value="36.7" required /></label>`,
    note: `<label class="field"><span>事件类型</span><select name="noteType"><option>家庭备注</option><option>皮肤观察</option><option>吐奶记录</option><option>外出记录</option><option>其他</option></select></label>`
  };
  $("#dynamicFields").innerHTML = fields[state.logType] || fields.note;
}

function formValue(formData, key, fallback = "") {
  return String(formData.get(key) || fallback).trim();
}

function submitLog(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const [hours, minutes] = $("#eventTime").value.split(":").map(Number);
  const at = new Date();
  at.setHours(hours, minutes, 0, 0);
  const note = $("#eventNote").value.trim();
  const builders = {
    feeding: () => { const mode = formValue(formData, "feedMode", "母乳"); const amount = formValue(formData, "amount", "已完成"); return { title: `${mode}喂养`, detail: note || `${amount}，状态已记录`, tags: [mode, amount] }; },
    sleep: () => { const mode = formValue(formData, "sleepMode", "开始睡眠"); return { title: mode, detail: note || "睡眠状态已记录", tags: [mode] }; },
    diaper: () => { const type = formValue(formData, "diaperType", "湿"); return { title: "更换尿布", detail: note || `${type}尿布，已完成更换`, tags: [type] }; },
    soothing: () => { const method = formValue(formData, "method", "抱哄"); const outcome = formValue(formData, "outcome", "明显缓解"); return { title: `${method}后${outcome}`, detail: note || `本次安抚结果：${outcome}`, tags: [method, outcome] }; },
    temperature: () => { const value = formValue(formData, "temperature", "36.7"); return { title: `体温 ${value}°C`, detail: note || "家庭测量记录", tags: ["体温"] }; },
    note: () => { const type = formValue(formData, "noteType", "家庭备注"); return { title: type, detail: note || "新增一条家庭照护备注", tags: ["家庭可见"] }; }
  };
  const content = (builders[state.logType] || builders.note)();
  state.events.unshift({ id: Date.now(), type: state.logType, at: at.toISOString(), ...content, author: "爸爸", manual: true });
  saveEvents();
  closeModal($("#logModal"));
  showToast(`${EVENT_META[state.logType].label}记录已保存`);
}

function resetSafetyFlow() {
  state.countdown.stop();
  cancelAnimationFrame(state.animationId);
  if (state.recording || state.stream || state.recorder) stopMediaCapture();
  state.recording = false;
  state.safetyAnswers = {};
  state.safetyResult = null;
  state.safetyEventSaved = false;
  state.safetyAnalysisSaved = false;
  $("#safetyForm").reset();
  $("#safetyContinueButton").disabled = true;
  $("#safetyContinueButton").textContent = "完成以上问题后继续";
  $("#safetyStage").classList.remove("hidden");
  $("#recorderStage").classList.add("hidden");
  $("#safetyResultStage").classList.add("hidden");
  $("#resultStage").classList.add("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateSafetyProgress() {
  const formData = new FormData($("#safetyForm"));
  const names = ["breathing", "response", "body", "cryChange"];
  const completed = names.filter(name => formData.get(name)).length;
  const button = $("#safetyContinueButton");
  button.disabled = completed !== names.length;
  button.textContent = completed === names.length ? "查看安全检查结果" : `还需回答 ${names.length - completed} 项`;
}

function submitSafety(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.safetyAnswers = Object.fromEntries(data.entries());
  const emergencyReasons = [];
  const concerningReasons = [];
  if (state.safetyAnswers.breathing === "emergency") emergencyReasons.push("照护者报告宝宝的呼吸或肤色出现异常");
  if (state.safetyAnswers.response === "emergency") emergencyReasons.push("照护者报告宝宝的反应或身体状态出现异常");
  if (state.safetyAnswers.breathing === "unsure") concerningReasons.push("目前无法确认宝宝的呼吸与肤色是否正常");
  if (state.safetyAnswers.response === "unsure") concerningReasons.push("目前无法确认宝宝的反应与身体状态是否正常");
  if (state.safetyAnswers.body === "concerning") concerningReasons.push("体温、进食、排尿或呕吐情况可能存在异常");
  if (state.safetyAnswers.body === "unsure") concerningReasons.push("目前无法确认体温、进食和排尿情况");
  if (state.safetyAnswers.cryChange === "concerning") concerningReasons.push("这次哭声明显不同于宝宝平时");
  if (state.safetyAnswers.cryChange === "unsure") concerningReasons.push("目前无法确认这次哭声是否不同于平时");
  if (emergencyReasons.length) return showSafetyResult("emergency", emergencyReasons);
  if (concerningReasons.length) return showSafetyResult("concerning", concerningReasons);
  showRecorderStage();
}

function showRecorderStage() {
  $("#safetyStage").classList.add("hidden");
  $("#safetyResultStage").classList.add("hidden");
  resetRecorder();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function safetyStatusForKind(kind) {
  return {
    emergency: SAFETY_STATUS.DANGER_SIGNS,
    concerning: SAFETY_STATUS.PATHOLOGICAL_RISK,
    anomaly: SAFETY_STATUS.ABNORMAL_CRY
  }[kind];
}

function showSafetyResult(kind, reasons) {
  const configs = {
    emergency: {
      level: "紧急求助",
      title: "请立即寻求紧急医疗帮助",
      summary: "你报告了可能需要立即处理的危险体征。本次不会继续录音、分析或设备控制。",
      guidanceTitle: "不要等待哭声分析结果",
      guidanceBody: "请立即联系当地急救服务或前往急诊。如在中国大陆，可拨打 120。",
      primary: "查看紧急求助方式",
      icon: "!"
    },
    concerning: {
      level: "需要尽快专业评估",
      title: "这次先不继续普通需求分析",
      summary: "当前信息不能安全归入常见需求。不会生成或执行任何环境方案。",
      guidanceTitle: "请尽快联系儿科或医疗咨询渠道",
      guidanceBody: "说明哭声变化和伴随状态。如呼吸、肤色或反应出现异常，请升级为紧急求助。",
      primary: "记录本次情况并返回首页",
      icon: "!"
    },
    anomaly: {
      level: "异常哭声，超出模型能力",
      title: "这次不显示需求概率",
      summary: "这段声音与个人基线差异较大。不会生成或执行任何环境方案。",
      guidanceTitle: "请结合整体状态进行专业评估",
      guidanceBody: "这不是疾病诊断。如哭声明显不同、持续无法安抚或伴随其他异常，请联系专业医疗人员。",
      primary: "记录本次情况并返回首页",
      icon: "≈"
    }
  };
  const config = configs[kind];
  state.safetyResult = { kind, reasons, at: new Date().toISOString() };
  $("#safetyStage").classList.add("hidden");
  $("#recorderStage").classList.add("hidden");
  $("#resultStage").classList.add("hidden");
  $("#safetyResultStage").classList.remove("hidden");
  $("#safetyResultHero").className = `safety-result-hero ${kind}`;
  $("#safetyGuidanceCard").className = `result-card safety-guidance-card ${kind}`;
  $("#safetyLevel").textContent = config.level;
  $("#safetyTitle").textContent = config.title;
  $("#safetySummary").textContent = config.summary;
  $("#safetyResultIcon").textContent = config.icon;
  $("#safetyGuidanceTitle").textContent = config.guidanceTitle;
  $("#safetyGuidanceBody").textContent = config.guidanceBody;
  $("#safetyPrimaryButton").textContent = config.primary;
  $("#safetyReasonList").innerHTML = reasons.map(reason => `<li><span>!</span><p>${escapeHTML(reason)}</p></li>`).join("");
  saveSafetyEvent();
  saveBlockedAnalysis(kind, reasons);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveSafetyEvent() {
  if (!state.safetyResult || state.safetyEventSaved) return;
  const labels = { emergency: "紧急安全分流", concerning: "建议尽快专业评估", anomaly: "异常哭声，超出模型能力" };
  state.events.unshift({
    id: Date.now(), type: "safety", at: state.safetyResult.at,
    title: labels[state.safetyResult.kind], detail: state.safetyResult.reasons.join("；"),
    tags: ["自动化已禁止", state.safetyResult.kind === "emergency" ? "紧急" : "未继续分析"], author: "爸爸"
  });
  state.safetyEventSaved = true;
  saveEvents();
}

function saveBlockedAnalysis(kind, reasons) {
  if (state.safetyAnalysisSaved) return;
  const status = safetyStatusForKind(kind);
  analysisStore.save({
    id: `cry-${Date.now()}-blocked`, timestamp: new Date().toISOString(), cryReason: "unclassified",
    probabilityDistribution: {}, confidence: 0,
    safetyResult: {
      status,
      pathologicalRisk: status === SAFETY_STATUS.PATHOLOGICAL_RISK,
      abnormalCry: status === SAFETY_STATUS.ABNORMAL_CRY,
      dangerSigns: status === SAFETY_STATUS.DANGER_SIGNS,
      classificationReliable: false,
      reasons
    },
    recommendedActions: []
  });
  state.safetyAnalysisSaved = true;
  renderAnalysisHistory();
}

function resetRecorder() {
  state.countdown.stop();
  cancelAnimationFrame(state.animationId);
  if (state.recording || state.stream || state.recorder) stopMediaCapture();
  state.recording = false;
  state.remaining = RECORDING_DURATION_SECONDS;
  state.levels = [];
  $("#timerValue").textContent = String(RECORDING_DURATION_SECONDS);
  $("#recordStatus").textContent = `轻触按钮开始 ${RECORDING_DURATION_SECONDS} 秒采集`;
  $("#recordButton").disabled = false;
  $("#recordButton").setAttribute("aria-label", "开始 5 秒录音");
  $("#recordButton").classList.remove("recording");
  $(".demo-actions").classList.remove("hidden");
  updateQuality("", "等待开始");
  $("#recorderStage").classList.remove("hidden");
  $("#safetyResultStage").classList.add("hidden");
  $("#resultStage").classList.add("hidden");
  drawIdleWave();
}

function updateQuality(className, text) {
  const pill = $("#qualityPill");
  pill.className = `quality-pill ${className}`;
  $("b", pill).textContent = text;
}

function drawIdleWave() {
  const canvas = $("#waveform");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(0, 113, 227, .3)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 7) {
    const y = canvas.height / 2 + Math.sin(x / 25) * 6 + Math.sin(x / 9) * 2;
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

function requestAppPermission(kind, onGranted) {
  if (permissions[kind] === "granted") return onGranted();
  const content = {
    microphone: ["◉", "允许使用麦克风？", "仅在你开始检测时采集 5 秒声音。原始音频默认不上传。"],
    home: ["⌂", "允许访问家庭设备？", "仅用于展示并执行与哭声结果相关、且经你确认的动作。"],
    notifications: ["◇", "允许发送照护提醒？", "仅在你主动开启提醒时发送观察与家庭交接通知。"]
  }[kind];
  state.permissionRequest = { kind, onGranted };
  $("#permissionGlyph").textContent = content[0];
  $("#permissionTitle").textContent = content[1];
  $("#permissionDescription").textContent = content[2];
  openModal($("#permissionModal"));
}

async function toggleRecording() {
  if (state.recording) {
    finishRecording({ automatic: false });
    return showToast("已提前结束录音，马上看看禾禾想表达什么");
  }
  requestAppPermission("microphone", beginRecording);
}

async function beginRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("当前打开方式无法使用麦克风，请使用演示分析或 localhost");
    updateQuality("low", "麦克风不可用");
    return;
  }
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    state.audioContext.createMediaStreamSource(state.stream).connect(state.analyser);
    state.recorder = new MediaRecorder(state.stream);
    state.recorder.start();
    state.recording = true;
    state.levels = [];
    $("#recordButton").classList.add("recording");
    $("#recordButton").disabled = false;
    $("#recordButton").setAttribute("aria-label", "停止录音并开始分析");
    $(".demo-actions").classList.add("hidden");
    $("#recordStatus").textContent = "正在听禾禾的声音，再轻触一次可以提前结束";
    updateQuality("good", "正在检测声音");
    state.countdown.start();
    visualizeWave();
  } catch (error) {
    state.countdown.stop();
    state.recording = false;
    cancelAnimationFrame(state.animationId);
    stopMediaCapture();
    $("#recordButton").classList.remove("recording");
    $("#recordButton").disabled = false;
    $("#recordButton").setAttribute("aria-label", "开始 5 秒录音");
    $(".demo-actions").classList.remove("hidden");
    const permissionDenied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    if (permissionDenied) {
      permissions.microphone = "denied";
      persistPermissions();
    }
    updateQuality("low", permissionDenied ? "未获得麦克风权限" : "录音启动失败");
    $("#recordStatus").textContent = permissionDenied
      ? "可在浏览器设置中允许麦克风，或体验演示分析"
      : "没有成功开始录音，请轻触按钮再试一次";
    showToast(permissionDenied ? "麦克风未授权，本次不会采集音频" : "录音没有成功开始，请再试一次");
  }
}

function visualizeWave() {
  const canvas = $("#waveform");
  const ctx = canvas.getContext("2d");
  const data = new Uint8Array(state.analyser.frequencyBinCount);
  const draw = () => {
    state.animationId = requestAnimationFrame(draw);
    state.analyser.getByteTimeDomainData(data);
    const level = data.reduce((sum, value) => sum + Math.abs(value - 128), 0) / data.length;
    state.levels.push(level);
    if (state.levels.length % 16 === 0) updateQuality(level > 2.4 ? "good" : "low", level > 2.4 ? "有效声音充足" : "声音有些轻");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = "#0071e3";
    ctx.lineWidth = 3;
    data.forEach((value, index) => {
      const x = index / (data.length - 1) * canvas.width;
      const y = value / 255 * canvas.height;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  draw();
}

function stopMediaCapture() {
  try {
    if (state.recorder?.state && state.recorder.state !== "inactive") state.recorder.stop();
  } catch {
    // A stopped track may already have closed MediaRecorder. Analysis should still continue.
  }
  state.stream?.getTracks().forEach(track => track.stop());
  state.audioContext?.close?.();
  state.recorder = null;
  state.stream = null;
  state.audioContext = null;
}

function renderInsights() {
  const combo = $("#comboChart");
  const heatmap = $("#heatmap");
  if (!combo || !heatmap) return;
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const cries = [3, 2, 2, 4, 3, 2, 2];
  const sleep = [72, 78, 82, 65, 74, 84, 80];
  combo.innerHTML = days.map((day, index) => `
    <div class="combo-day" aria-label="周${day}，哭闹 ${cries[index]} 次，睡眠指数 ${sleep[index]}">
      <span class="sleep-bar" style="height:${sleep[index]}%"></span>
      <i class="cry-mark" style="bottom:${Math.min(88, cries[index] * 18)}%"></i>
      <small>${day}</small>
    </div>`).join("");
  const intensity = [0,0,0,0,1,1,0,0,1,1,0,0,0,1,0,1,1,2,3,3,2,1,0,0];
  heatmap.innerHTML = intensity.map((level, hour) => `<span class="heat-${level}" title="${hour} 时，${level ? "有哭闹记录" : "暂无记录"}"></span>`).join("");
}

function finishRecording({ automatic = false } = {}) {
  if (!state.recording) return;
  state.recording = false;
  state.countdown.stop();
  cancelAnimationFrame(state.animationId);
  stopMediaCapture();
  $("#recordButton").classList.remove("recording");
  $("#recordButton").setAttribute("aria-label", "声音已采集，正在分析");
  $("#recordStatus").textContent = automatic ? "5 秒声音已听完，正在理解禾禾的需要" : "声音已采集，正在分析";
  runInference("normal", false);
}

function runInference(mode = "normal", demo = true) {
  state.countdown.stop();
  if (state.recording) {
    state.recording = false;
    stopMediaCapture();
  }
  $("#recordButton").disabled = true;
  $("#recordStatus").textContent = "正在分析声音、状态与个人记录";
  updateQuality("good", "声音已采集");
  const messages = ["正在筛选有效哭声", "正在检查声音适用范围", "正在对照个人声音基线"];
  let messageIndex = 0;
  const progress = setInterval(() => {
    $("#recordStatus").textContent = messages[Math.min(messageIndex++, messages.length - 1)];
  }, 420);
  setTimeout(() => {
    clearInterval(progress);
    if (mode === "anomaly") {
      $("#recordButton").disabled = false;
      return showSafetyResult("anomaly", ["声音音高与音质明显偏离过去的可靠录音", "模型识别为分布外输入，无法安全生成需求概率"]);
    }
    state.analysisSequence += 1;
    const mean = state.levels.length ? state.levels.reduce((a, b) => a + b, 0) / state.levels.length : 6;
    let probabilities;
    if (mode === "low") probabilities = [44, 34, 22];
    else if (mode === "sleepy") probabilities = [16, 78, 6];
    else if (mean < 2.4) probabilities = [44, 34, 22];
    else probabilities = [[16, 78, 6], [76, 16, 8], [22, 58, 20]][(state.analysisSequence - 1) % 3];
    showResult(probabilities, demo);
  }, 1550);
}

function showResult(probabilities, demo) {
  const labels = ["饥饿", "困倦", "一般性不适"];
  const reasonKeys = [CRY_REASONS.HUNGER, CRY_REASONS.SLEEPY, CRY_REASONS.DISCOMFORT];
  const maximum = Math.max(...probabilities);
  const top = probabilities.indexOf(maximum);
  const confidenceBand = classifyConfidence(probabilities);
  const reliable = confidenceBand === "high";
  const safetyResult = reliable ? createSafeResult() : {
    status: confidenceBand === "low" ? SAFETY_STATUS.LOW_CONFIDENCE : SAFETY_STATUS.UNRELIABLE,
    pathologicalRisk: false,
    abnormalCry: false,
    dangerSigns: false,
    classificationReliable: false
  };
  const analysis = {
    id: `cry-${Date.now()}-${state.analysisSequence}`,
    timestamp: new Date().toISOString(),
    cryReason: reasonKeys[top],
    probabilityDistribution: {
      hunger: probabilities[0] / 100,
      sleepy: probabilities[1] / 100,
      discomfort: probabilities[2] / 100
    },
    confidence: maximum / 100,
    classificationReliable: reliable,
    safetyResult,
    context: { temperature: 25.8, humidity: 46, diaperConcern: false }
  };
  const plan = buildAutomationPlan(analysis, smartHomeAdapter.listDevices());
  analysis.recommendedActions = plan.actions;
  analysisStore.save(analysis);
  state.activeResult = { ...analysis, probabilities, top, confidenceBand, demo, plan };

  $("#topProbability").textContent = `${maximum}%`;
  $("#topReason").textContent = labels[top];
  $("#confidenceLabel").textContent = reliable ? "较高置信度" : confidenceBand === "medium" ? "无法可靠分类" : "低置信度";
  $("#resultSummary").textContent = reliable
    ? ["声音与近期喂养间隔更接近饥饿信号。", "声音节奏与较长清醒时长更接近困倦信号。", "声音更接近一般性不适，请结合环境与身体状态。 "][top]
    : "几种可能性仍较接近，仅凭这段声音不能可靠判断。";
  $("#matchRing").style.setProperty("--match", `${maximum}%`);
  ["hunger", "sleepy", "discomfort"].forEach((key, index) => {
    $(`#${key}Value`).textContent = `${probabilities[index]}%`;
    $(`#${key}Bar`).style.width = `${probabilities[index]}%`;
  });

  const actions = [
    ["按熟悉的方式喂养", "距离上次喂养已有一段时间。先按家庭日常方式尝试，再观察宝宝是否逐渐平静。"],
    ["降低刺激，准备入睡", "减少说话与逗弄，使用禾禾熟悉的抱哄方式并观察。"],
    ["先检查身体与环境", "检查尿布、衣物松紧、体温与姿势。如状态异常或持续剧烈哭闹，请寻求专业帮助。"]
  ];
  $("#actionTitle").textContent = actions[top][0];
  $("#actionDescription").textContent = actions[top][1];
  $("#actionCard").classList.toggle("hidden", !reliable);
  $("#checklistCard").classList.toggle("hidden", reliable);
  const evidence = top === 0
    ? [["支持饥饿", "距离上次喂养已有一段时间。"], ["支持饥饿", "哭声节奏与过去饥饿记录相似。"]]
    : top === 1
      ? [["支持困倦", "哭声强度逐渐回落，接近以往困倦时的节奏。"], ["支持困倦", "当前清醒时长比近期常见时长多约 18 分钟。"]]
      : [["建议检查", "声音特征更接近一般性不适。"], ["需要结合", "尿布、姿势、体温和精神状态仍需人工确认。"]];
  $("#evidenceList").innerHTML = evidence.map(item => `<li><span>↑</span><p><b>${item[0]}</b>${item[1]}</p></li>`).join("")
    + `<li class="neutral"><span>i</span><p><b>仍有不确定</b>${demo ? "本次为模拟分析，不具备真实识别能力。" : "录音中可能存在少量背景声音。"}</p></li>`;

  renderAutomationPlan(plan);
  $("#recorderStage").classList.add("hidden");
  $("#resultStage").classList.remove("hidden");
  $("#recordButton").disabled = false;
  state.events.unshift({
    id: Date.now(), type: "cry", at: analysis.timestamp,
    title: `哭声分析：${reliable ? `更可能${labels[top]}` : "暂时无法可靠判断"}`,
    detail: `采集 ${RECORDING_DURATION_SECONDS} 秒，匹配度 ${maximum}%`,
    tags: [reliable ? "较高置信度" : "自动化已禁止", demo ? "模拟分析" : "待反馈"], author: "爸爸"
  });
  saveEvents();
  renderAnalysisHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deviceStatusLabel(status) {
  return {
    online: "在线",
    connected: "已连接",
    offline: "离线",
    unauthorized: "未授权"
  }[status] || "未知";
}

function renderAutomationPlan(plan) {
  const card = $("#automationPlanCard");
  if (plan.status === PLAN_STATUS.BLOCKED || !plan.actions.length) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  $("#automationPlanTitle").textContent = plan.reason === CRY_REASONS.SLEEPY ? "睡眠环境方案" : plan.reason === CRY_REASONS.HUNGER ? "夜间喂养辅助" : "环境舒适方案";
  $("#automationPlanStatus").textContent = "待授权";
  $("#automationPlanStatus").className = "status-badge pending";
  $("#automationActionList").innerHTML = plan.actions.map(action => {
    const device = smartHomeAdapter.listDevices().find(item => item.id === action.deviceId);
    const stateLabel = action.alreadyOptimal
      ? "现在已经很合适，保持即可"
      : device?.automationEnabled === false
        ? "已关闭方案权限"
        : deviceStatusLabel(action.deviceStatus);
    return `<label class="plan-action ${action.enabled ? "" : action.alreadyOptimal ? "already-optimal" : "unavailable"}">
      <input type="checkbox" data-plan-action value="${escapeHTML(action.id)}" ${action.enabled ? "checked" : "disabled"} />
      <span class="plan-check" aria-hidden="true"></span>
      <span class="plan-device"><b>${escapeHTML(device?.name || action.deviceId)}</b><small>${escapeHTML(action.label)}，${escapeHTML(action.detail)}</small><em>${escapeHTML(stateLabel)}</em></span>
    </label>`;
  }).join("");
  const unavailable = plan.actions.some(action => action.requiresExecution && !action.enabled && !action.alreadyOptimal);
  $("#offlineDecision").classList.toggle("hidden", !unavailable);
  $("#executionStatus").classList.add("hidden");
  $("#allowExecutionButton").classList.remove("hidden");
  $("#allowExecutionButton").disabled = false;
  $$('[data-plan-action]').forEach(input => input.addEventListener("change", updatePlanSelection));
  updatePlanSelection();
}

function selectedActionIds() {
  return $$('[data-plan-action]:checked').map(input => input.value);
}

function updatePlanSelection() {
  const count = selectedActionIds().length;
  $("#allowExecutionButton").disabled = count === 0;
  $("#allowExecutionButton").textContent = count ? `允许执行 ${count} 项` : "当前环境无需调节";
}

function openAutomationConfirmation(actionIds = selectedActionIds()) {
  if (!state.activeResult?.plan || !actionIds.length) return showToast("请至少保留一项可用动作");
  state.retryActionIds = actionIds;
  const plan = state.activeResult.plan;
  $("#automationConfirmList").innerHTML = plan.actions.filter(action => actionIds.includes(action.id)).map(action => {
    const device = smartHomeAdapter.listDevices().find(item => item.id === action.deviceId);
    return `<div><b>${escapeHTML(device?.name || action.deviceId)}</b><span>${escapeHTML(action.label)}，${escapeHTML(action.detail)}</span></div>`;
  }).join("");
  openModal($("#automationConfirmModal"));
}

function declineAutomation(reason = "user_declined") {
  if (state.activeResult?.plan) {
    const consent = new UserConsent({ planId: state.activeResult.plan.id, granted: false, actionIds: [], source: reason });
    analysisStore.recordConsent(state.activeResult.id, consent);
  }
  closeModal($("#automationConfirmModal"));
  showToast("未发送任何设备控制命令");
}

async function executeAutomation() {
  const active = state.activeResult;
  if (!active?.plan) return;
  const consent = new UserConsent({ planId: active.plan.id, granted: true, actionIds: state.retryActionIds });
  analysisStore.recordConsent(active.id, consent);
  closeModal($("#automationConfirmModal"));
  const status = $("#executionStatus");
  status.className = "execution-status executing";
  status.innerHTML = "<b>执行中</b><span>正在逐台发送已授权动作，请稍候。</span>";
  $("#allowExecutionButton").disabled = true;
  await new Promise(resolve => setTimeout(resolve, 650));
  const result = await smartHomeAdapter.executePlan(active.plan, consent);
  analysisStore.recordExecution(active.id, result);
  renderExecutionResult(result);
  renderDevices();
  renderHomeSmartCard();
  const completed = result.results.filter(item => item.status === "completed").length;
  state.events.unshift({
    id: Date.now(), type: "automation", at: new Date().toISOString(),
    title: `环境方案${executionLabel(result.status)}`,
    detail: `已完成 ${completed} 项，共授权 ${result.results.length} 项`,
    tags: [executionLabel(result.status), "用户已授权"], author: "爸爸"
  });
  saveEvents();
}

function executionLabel(status) {
  return {
    executing: "执行中",
    completed: "已完成",
    partial_failed: "部分失败",
    failed: "执行失败",
    cancelled: "已取消"
  }[status] || "状态未知";
}

function renderExecutionResult(result) {
  const status = $("#executionStatus");
  const failed = result.results.filter(item => item.status === "failed");
  const completed = result.results.filter(item => item.status === "completed");
  status.className = `execution-status ${result.status}`;
  status.innerHTML = `<b>${executionLabel(result.status)}</b><span>${completed.length} 项已完成${failed.length ? `，${failed.length} 项失败。其他设备状态不受影响。` : "，设备状态已更新。"}</span>${failed.length ? '<button class="secondary-button" id="retryFailedButton" type="button">重试失败项</button>' : ""}`;
  $("#automationPlanStatus").textContent = executionLabel(result.status);
  $("#automationPlanStatus").className = `status-badge ${result.status === PLAN_STATUS.COMPLETED ? "safe" : "warning"}`;
  $("#allowExecutionButton").classList.add("hidden");
  $("#retryFailedButton")?.addEventListener("click", () => openAutomationConfirmation(failed.map(item => item.actionId)));
}

function cancelEntirePlan() {
  const active = state.activeResult;
  if (!active?.plan) return;
  active.plan.status = PLAN_STATUS.CANCELLED;
  const consent = new UserConsent({ planId: active.plan.id, granted: false, actionIds: [], source: "cancel_entire_plan" });
  analysisStore.recordConsent(active.id, consent);
  $("#automationPlanStatus").textContent = "已取消";
  $("#automationPlanStatus").className = "status-badge neutral";
  $("#allowExecutionButton").classList.add("hidden");
  $("#offlineDecision").classList.add("hidden");
  $("#executionStatus").className = "execution-status cancelled";
  $("#executionStatus").innerHTML = "<b>方案已取消</b><span>未发送任何设备控制命令。</span>";
}

function deviceStateSummary(device) {
  if (device.category === "crib") return device.state.rocking ? `轻摇开启，${device.state.intensity === "low" ? "低" : "中"}强度` : "摇动关闭";
  if (device.category === "light") return `${device.state.on ? "已开启" : "已关闭"}，亮度 ${device.state.brightness}% ，${device.state.colorTemperature}K`;
  if (device.category === "climate") return `当前 ${device.state.currentTemperature}°C，目标 ${device.state.targetTemperature}°C`;
  if (device.category === "sensor") return `${device.state.temperature}°C，湿度 ${device.state.humidity}% RH`;
  if (device.category === "audio") return device.state.on ? `播放中，音量 ${device.state.volume}%` : "当前关闭";
  if (device.category === "humidifier") return `${device.state.on ? "已开启" : "当前关闭"}，湿度 ${device.state.currentHumidity}% RH`;
  return "状态已同步";
}

function renderDevices() {
  const devices = smartHomeAdapter.listDevices();
  $("#deviceCountLabel").textContent = `${devices.length} 台`;
  $("#deviceList").innerHTML = devices.map(device => `
    <button class="device-row" type="button" data-device-id="${escapeHTML(device.id)}" aria-label="查看${escapeHTML(device.name)}详情">
      <span class="device-icon">${escapeHTML(device.name.slice(0, 1))}</span>
      <div><b>${escapeHTML(device.name)}</b><small>${escapeHTML(deviceStateSummary(device))}</small><em>${device.automationEnabled ? "可加入哭因方案" : "已暂停加入方案"}</em></div>
      <span class="device-status ${escapeHTML(device.status)}">${escapeHTML(deviceStatusLabel(device.status))}<i aria-hidden="true">›</i></span>
    </button>`).join("");
  $$('[data-device-id]').forEach(button => button.addEventListener("click", () => openDeviceDetail(button.dataset.deviceId)));
  $("#futureAdapterList").textContent = FUTURE_SMART_HOME_ADAPTERS.join(" / ");
  const granted = permissions.home === "granted";
  $("#homePermissionTitle").textContent = granted ? "模拟家庭已连接" : permissions.home === "denied" ? "模拟设备已显示，方案联动未允许" : "6 台模拟设备已准备好";
  $("#homePermissionDescription").textContent = granted ? "可以查看状态；每一次执行仍会单独征得你的同意。" : "查看设备不需要权限，真正加入方案时再由你决定。";
  $("#connectHomeButton").textContent = granted ? "刷新状态" : "允许方案联动";
  $("#connectHomeButton").disabled = false;
}

function openDeviceDetail(deviceId) {
  state.activeDeviceId = deviceId;
  renderDeviceDetail();
  openModal($("#deviceDetailModal"));
}

function renderDeviceDetail() {
  const device = smartHomeAdapter.listDevices().find(item => item.id === state.activeDeviceId);
  if (!device) return closeModal($("#deviceDetailModal"));
  $("#deviceDetailTitle").textContent = device.name;
  $("#deviceDetailStatus").innerHTML = `<span class="device-icon">${escapeHTML(device.name.slice(0, 1))}</span><p><b>${escapeHTML(deviceStatusLabel(device.status))}</b><small>模拟设备状态已同步</small></p>`;
  $("#deviceDetailState").innerHTML = `<small>现在的状态</small><strong>${escapeHTML(deviceStateSummary(device))}</strong><span>${escapeHTML(device.capabilities.map(item => item.type).join("，"))}</span>`;
  $("#deviceAutomationToggle").checked = device.automationEnabled;
}

async function testDeviceConnection() {
  const device = smartHomeAdapter.listDevices().find(item => item.id === state.activeDeviceId);
  if (!device) return;
  const button = $("#testDeviceConnectionButton");
  button.disabled = true;
  button.textContent = "正在轻轻确认连接";
  await new Promise(resolve => setTimeout(resolve, 500));
  button.disabled = false;
  button.textContent = "再次测试连接";
  $("#deviceDetailStatus small").textContent = "刚刚确认，连接状态良好";
  showToast(`${device.name}连接正常，等需要时再为禾禾帮忙`);
}

function startObservation() {
  state.observationSeconds = 600;
  openModal($("#observeModal"));
  updateObserveTimer();
  clearInterval(state.observationId);
  state.observationId = setInterval(() => {
    state.observationSeconds = Math.max(0, state.observationSeconds - 1);
    updateObserveTimer();
    if (state.observationSeconds === 0) clearInterval(state.observationId);
  }, 1000);
}

function updateObserveTimer() {
  const minutes = Math.floor(state.observationSeconds / 60);
  const seconds = String(state.observationSeconds % 60).padStart(2, "0");
  $("#observeTimer").textContent = `${minutes}:${seconds}`;
}

function saveOutcome(value) {
  const label = { relieved: "明显缓解", some: "有一点缓解", none: "没有缓解" }[value];
  state.events.unshift({ id: Date.now(), type: "soothing", at: new Date().toISOString(), title: `照护后${label}`, detail: `本次建议反馈：${label}`, tags: [label], author: "爸爸" });
  if (state.activeResult) analysisStore.recordFeedback(state.activeResult.id, { userFeedback: value, interventionEffective: value === "relieved" });
  saveEvents();
  renderAnalysisHistory();
  closeModal($("#observeModal"));
  showToast("反馈已保存，已更新禾禾的个性化记录");
}

function saveAnalysisFeedback(value, button) {
  if (!state.activeResult) return;
  const effective = value === "effective" ? true : value === "not_effective" ? false : null;
  analysisStore.recordFeedback(state.activeResult.id, { userFeedback: value, interventionEffective: effective });
  $$('[data-analysis-feedback]').forEach(item => item.classList.toggle("selected", item === button));
  renderAnalysisHistory();
  showToast("反馈已保存，不会作为医学诊断依据");
}

function initializeDate() {
  const now = new Date();
  $("#dateLabel").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(now);
}

function renderEverything() {
  initializeDate();
  renderHome();
  renderTimeline();
  renderAnalysisHistory();
  renderDevices();
  renderInsights();
  drawIdleWave();
  $("#notificationPermissionText").textContent = permissions.notifications === "granted" ? "通知权限已允许" : "按需申请通知权限";
}

$("#onboardingNextButton").addEventListener("click", () => {
  if (state.onboardingPage < 2) {
    state.onboardingPage += 1;
    renderOnboarding();
  } else finishOnboarding();
});
$("#skipOnboardingButton").addEventListener("click", finishOnboarding);
$("#appleLoginButton").addEventListener("click", mockLogin);
$("#emailContinueButton").addEventListener("click", () => $("#emailLoginForm").classList.toggle("hidden"));
$("#emailLoginForm").addEventListener("submit", event => { event.preventDefault(); mockLogin(); });
[$("#termsLink"), $("#privacyLink")].forEach(link => link.addEventListener("click", event => { event.preventDefault(); showToast("原型阶段展示说明，不会离开当前页面"); }));

$$('[data-nav]').forEach(button => button.addEventListener("click", () => navigate(button.dataset.nav)));
$$('[data-back-home]').forEach(button => button.addEventListener("click", () => navigate("home")));
$("#listenHero").addEventListener("click", () => { navigate("listen"); resetSafetyFlow(); });
$("#homeSmartCard").addEventListener("click", () => navigate("devices"));
$$('[data-log]').forEach(button => button.addEventListener("click", () => openLog(button.dataset.log)));
$$('#typeSelector [data-type]').forEach(button => button.addEventListener("click", () => { state.logType = button.dataset.type; renderLogFields(); }));
$("#closeLogModal").addEventListener("click", () => closeModal($("#logModal")));
$("#logForm").addEventListener("submit", submitLog);
$("#safetyForm").addEventListener("change", updateSafetyProgress);
$("#safetyForm").addEventListener("submit", submitSafety);
$("#caregiverConcernButton").addEventListener("click", () => showSafetyResult("concerning", ["照护者主动表示宝宝这次的状态让人担心"]));
$("#editSafetyButton").addEventListener("click", resetSafetyFlow);
$("#restartSafetyButton").addEventListener("click", resetSafetyFlow);
$$('#timelineFilters [data-filter]').forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  $$("#timelineFilters [data-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderTimeline();
}));
$("#recordButton").addEventListener("click", toggleRecording);
$("#demoButton").addEventListener("click", () => runInference("sleepy", true));
$("#lowConfidenceDemoButton").addEventListener("click", () => runInference("low", true));
$("#anomalyDemoButton").addEventListener("click", () => runInference("anomaly", true));
$("#newAnalysisButton").addEventListener("click", resetRecorder);
$("#safetyPrimaryButton").addEventListener("click", () => {
  if (state.safetyResult?.kind === "emergency") return showToast("如在中国大陆，请立即拨打 120 或前往急诊");
  navigate("home");
  showToast("安全分流记录已放进时间线");
});
$("#safetySummaryButton").addEventListener("click", () => showToast("摘要仅预览，不会自动分享"));
$("#startObserveButton").addEventListener("click", startObservation);
$("#closeObserve").addEventListener("click", () => closeModal($("#observeModal")));
$("#finishLaterButton").addEventListener("click", () => { closeModal($("#observeModal")); showToast("不着急，稍后可以从时间线补充反馈"); });
$$('[data-outcome]').forEach(button => button.addEventListener("click", () => saveOutcome(button.dataset.outcome)));
$$('[data-analysis-feedback]').forEach(button => button.addEventListener("click", () => saveAnalysisFeedback(button.dataset.analysisFeedback, button)));
$("#allowExecutionButton").addEventListener("click", () => openAutomationConfirmation());
$("#executeRemainingButton").addEventListener("click", () => openAutomationConfirmation(selectedActionIds()));
$("#cancelEntirePlanButton").addEventListener("click", cancelEntirePlan);
$("#confirmAutomationButton").addEventListener("click", executeAutomation);
$("#declineAutomationButton").addEventListener("click", () => declineAutomation());
$("#connectHomeButton").addEventListener("click", () => {
  if (permissions.home === "granted") {
    renderDevices();
    return showToast("6 台模拟设备状态已更新，大家都在好好待命");
  }
  requestAppPermission("home", () => { renderDevices(); showToast("方案联动已允许，每次执行前仍会先问你"); });
});
$("#closeDeviceDetailButton").addEventListener("click", () => closeModal($("#deviceDetailModal")));
$("#testDeviceConnectionButton").addEventListener("click", testDeviceConnection);
$("#deviceAutomationToggle").addEventListener("change", event => {
  const device = smartHomeAdapter.listDevices().find(item => item.id === state.activeDeviceId);
  if (!device) return;
  device.automationEnabled = event.currentTarget.checked;
  renderDevices();
  renderHomeSmartCard();
  showToast(device.automationEnabled ? `${device.name}会在合适的哭因方案里待命` : `${device.name}已暂停加入新的照护方案`);
});
$("#notificationButton").addEventListener("click", () => requestAppPermission("notifications", () => { $("#notificationPermissionText").textContent = "通知权限已允许"; showToast("照护提醒已开启"); }));
$("#notificationSettings").addEventListener("click", () => requestAppPermission("notifications", () => { $("#notificationPermissionText").textContent = "通知权限已允许"; showToast("照护提醒已开启"); }));
$("#allowPermissionButton").addEventListener("click", () => {
  const request = state.permissionRequest;
  if (!request) return;
  permissions[request.kind] = "granted";
  persistPermissions();
  closeModal($("#permissionModal"));
  state.permissionRequest = null;
  request.onGranted();
});
$("#denyPermissionButton").addEventListener("click", () => {
  const request = state.permissionRequest;
  if (request) {
    permissions[request.kind] = "denied";
    persistPermissions();
  }
  state.permissionRequest = null;
  closeModal($("#permissionModal"));
  showToast("未授权，本次不会访问该权限");
});
$("#revisitOnboardingButton").addEventListener("click", () => {
  state.onboardingPage = 0;
  renderOnboarding();
  showOnlyGate($("#onboardingScreen"));
});
$("#logoutButton").addEventListener("click", () => {
  flow.loggedIn = false;
  persistFlow();
  showOnlyGate($("#loginScreen"));
});

const simpleToasts = {
  babySwitch: "多宝宝切换将在后续版本开放",
  handoffButton: "过去 6 小时照护摘要已准备",
  probabilityInfo: "概率来自声音和上下文的模拟结果，不代表医学诊断",
  editProfileButton: "宝宝档案编辑将在下一迭代开放",
  knowledgeButton: "安全知识内容需完成专业审核后开放",
  privacyButton: "原始音频默认不上传，分析与训练将分别授权",
  personalizationButton: "只学习照护偏好，不把设备行为用于医学诊断",
  inviteButton: "家人邀请将在接入真实账户后开放",
  exportButton: "照护摘要已准备好，原型不会自动分享",
  reportButton: "本周照护小结已整理好，分享前会再次请你确认",
  periodButton: "月度洞察将在积累更多记录后开放"
};
Object.entries(simpleToasts).forEach(([id, message]) => $(`#${id}`)?.addEventListener("click", () => showToast(message)));

[$("#logModal"), $("#observeModal"), $("#automationConfirmModal"), $("#permissionModal"), $("#deviceDetailModal")].forEach(modal => {
  modal.addEventListener("click", event => {
    if (event.target !== modal) return;
    if (modal === $("#automationConfirmModal")) declineAutomation("sheet_dismissed");
    else if (modal === $("#permissionModal")) $("#denyPermissionButton").click();
    else closeModal(modal);
  });
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  const open = $$(".modal-backdrop:not(.hidden)").at(-1);
  if (!open) return;
  if (open === $("#automationConfirmModal")) declineAutomation("escape_dismissed");
  else if (open === $("#permissionModal")) $("#denyPermissionButton").click();
  else closeModal(open);
});

renderEverything();
setTimeout(showPostLaunchDestination, 850);
