const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const EVENT_META = {
  feeding: { icon: "◒", label: "喂养", className: "" },
  sleep: { icon: "☾", label: "睡眠", className: "sleep" },
  diaper: { icon: "◇", label: "尿布", className: "diaper" },
  cry: { icon: "∿", label: "哭闹分析", className: "cry" },
  soothing: { icon: "∿", label: "安抚", className: "soothing" },
  safety: { icon: "!", label: "安全分流", className: "safety" },
  temperature: { icon: "°", label: "体温", className: "temperature" },
  note: { icon: "+", label: "家庭备注", className: "note" }
};

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

const seedEvents = [
  { id: 1, type: "diaper", at: minutesAgo(48), title: "更换尿布", detail: "湿尿布，皮肤状态正常", tags: ["湿", "已清洁"], author: "爸爸" },
  { id: 2, type: "feeding", at: minutesAgo(120), title: "奶瓶喂养", detail: "配方奶 120 ml，喂养后已拍嗝", tags: ["120 ml", "已拍嗝"], author: "爸爸" },
  { id: 3, type: "sleep", at: minutesAgo(206), title: "午睡结束", detail: "睡眠 1 小时 12 分，醒来状态平稳", tags: ["1h 12m", "自然醒"], author: "妈妈" },
  { id: 4, type: "soothing", at: minutesAgo(292), title: "抱哄后明显缓解", detail: "降低光线并抱哄，约 6 分钟后平静", tags: ["抱哄", "明显缓解"], author: "妈妈" },
  { id: 5, type: "cry", at: minutesAgo(300), title: "哭闹 · 更可能困倦", detail: "哭闹约 5 分钟，模拟分析匹配度 72%", tags: ["中等置信度", "已反馈"], author: "妈妈" },
  { id: 6, type: "feeding", at: minutesAgo(425), title: "母乳喂养", detail: "左侧 12 分钟，右侧 9 分钟", tags: ["21 分钟"], author: "妈妈" },
  { id: 7, type: "diaper", at: minutesAgo(454), title: "更换尿布", detail: "湿 + 便，已完成清洁", tags: ["湿 + 便"], author: "妈妈" },
  { id: 8, type: "sleep", at: minutesAgo(502), title: "夜间睡眠结束", detail: "本段睡眠 3 小时 2 分", tags: ["3h 02m"], author: "爸爸" }
];

const state = {
  view: "today",
  filter: "all",
  logType: "feeding",
  events: JSON.parse(localStorage.getItem("crysense-v2-events") || "null") || seedEvents,
  stream: null,
  audioContext: null,
  analyser: null,
  recorder: null,
  recording: false,
  remaining: 10,
  timerId: null,
  animationId: null,
  levels: [],
  analysisId: 0,
  activeResult: null,
  safetyAnswers: {},
  safetyResult: null,
  safetyEventSaved: false,
  observationId: null,
  observationSeconds: 600
};

const views = {
  today: $("#todayView"),
  timeline: $("#timelineView"),
  listen: $("#listenView"),
  insights: $("#insightsView"),
  profile: $("#profileView")
};

function navigate(name) {
  if (!views[name]) return;
  state.view = name;
  Object.entries(views).forEach(([key, view]) => view.classList.toggle("active", key === name));
  $$(".bottom-nav [data-nav]").forEach(button => button.classList.toggle("active", button.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "timeline") renderTimeline();
  if (name === "insights") renderInsights();
  if (name === "today") renderToday();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.id);
  showToast.id = setTimeout(() => toast.classList.remove("show"), 2800);
}

function saveEvents() {
  localStorage.setItem("crysense-v2-events", JSON.stringify(state.events));
  renderToday();
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
  return `${hours} 小时${minutes % 60 ? ` ${minutes % 60} 分` : ""}前`;
}

function iconMarkup(type) {
  const meta = EVENT_META[type] || EVENT_META.note;
  return `<span class="event-icon ${meta.className}">${meta.icon}</span>`;
}

function renderToday() {
  const todayEvents = state.events.filter(event => sameDay(event.at)).sort((a, b) => new Date(b.at) - new Date(a.at));
  const byType = type => todayEvents.filter(event => event.type === type);
  $("#feedCount").textContent = Math.max(5, byType("feeding").length);
  $("#diaperCount").textContent = Math.max(4, byType("diaper").length);
  $("#cryCount").textContent = Math.max(3, byType("cry").length);
  const latestFeed = byType("feeding")[0];
  const latestDiaper = byType("diaper")[0];
  if (latestFeed) $("#lastFeedText").textContent = relativeTime(latestFeed.at);
  if (latestDiaper) $("#lastDiaperText").textContent = relativeTime(latestDiaper.at);
  if (latestFeed) $("[data-log='feeding'] small").textContent = `上次 ${formatTime(latestFeed.at)}`;
  if (latestDiaper) $("[data-log='diaper'] small").textContent = `上次 ${formatTime(latestDiaper.at)}`;
  $("#todayTimeline").innerHTML = todayEvents.slice(0, 3).map(event => `
    <article class="mini-event">
      ${iconMarkup(event.type)}
      <div><b>${event.title}</b><small>${event.detail}</small></div>
      <time>${formatTime(event.at)}</time>
    </article>`).join("");
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
        <div><b>${event.title}</b><time>${formatTime(event.at)}</time></div>
        <p>${event.detail}</p>
        <div class="event-tags">${(event.tags || []).map(tag => `<span>${tag}</span>`).join("")}</div>
        <div class="event-author">由${event.author || "爸爸"}记录${event.manual ? " · 手动补记" : ""}</div>
      </div>
    </article>`).join("") : `<div class="empty-state"><p>这个分类下还没有记录。</p><button class="inline-link" type="button" data-empty-log>现在记录一条 →</button></div>`;
  const emptyButton = $("[data-empty-log]");
  emptyButton?.addEventListener("click", () => openLog(state.filter === "all" ? "note" : state.filter));
}

function localTimeValue() {
  return new Date().toTimeString().slice(0, 5);
}

function openLog(type = "feeding") {
  state.logType = EVENT_META[type] ? type : "note";
  $("#eventTime").value = localTimeValue();
  $("#eventNote").value = "";
  renderLogFields();
  $("#logModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLog() {
  $("#logModal").classList.add("hidden");
  document.body.style.overflow = "";
}

function renderLogFields() {
  $$("#typeSelector [data-type]").forEach(button => button.classList.toggle("active", button.dataset.type === state.logType));
  $("#logModalTitle").textContent = `记录${EVENT_META[state.logType].label}`;
  const fields = {
    feeding: `<div class="field"><span>喂养方式</span><div class="segmented"><label><input type="radio" name="feedMode" value="母乳" checked /><span>母乳</span></label><label><input type="radio" name="feedMode" value="奶瓶" /><span>奶瓶</span></label><label><input type="radio" name="feedMode" value="混合" /><span>混合</span></label></div></div><label class="field"><span>时长或奶量</span><input name="amount" placeholder="例如：15 分钟 / 120 ml" value="15 分钟" /></label>`,
    sleep: `<div class="field"><span>记录状态</span><div class="segmented"><label><input type="radio" name="sleepMode" value="开始睡眠" checked /><span>开始睡眠</span></label><label><input type="radio" name="sleepMode" value="睡眠结束" /><span>睡眠结束</span></label></div></div><label class="field"><span>入睡方式（选填）</span><select name="method"><option>抱哄</option><option>自主入睡</option><option>喂养后入睡</option><option>其他</option></select></label>`,
    diaper: `<div class="field"><span>尿布类型</span><div class="segmented"><label><input type="radio" name="diaperType" value="湿" checked /><span>湿</span></label><label><input type="radio" name="diaperType" value="便" /><span>便</span></label><label><input type="radio" name="diaperType" value="湿 + 便" /><span>湿 + 便</span></label></div></div>`,
    soothing: `<label class="field"><span>安抚方式</span><select name="method"><option>抱哄 + 降低刺激</option><option>喂养</option><option>拍嗝 / 调整姿势</option><option>白噪音</option><option>更换尿布</option></select></label><div class="field"><span>宝宝是否缓解？</span><div class="segmented"><label><input type="radio" name="outcome" value="明显缓解" checked /><span>明显缓解</span></label><label><input type="radio" name="outcome" value="有一点" /><span>有一点</span></label><label><input type="radio" name="outcome" value="没有缓解" /><span>没有</span></label></div></div>`,
    temperature: `<label class="field"><span>体温</span><input type="number" name="temperature" min="34" max="43" step="0.1" value="36.7" required /></label><div class="field"><span>测量方式</span><div class="segmented"><label><input type="radio" name="measure" value="腋温" checked /><span>腋温</span></label><label><input type="radio" name="measure" value="耳温" /><span>耳温</span></label><label><input type="radio" name="measure" value="额温" /><span>额温</span></label></div></div>`,
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
    sleep: () => { const mode = formValue(formData, "sleepMode", "开始睡眠"); const method = formValue(formData, "method", "抱哄"); return { title: mode, detail: note || `${method}，已开始记录本次睡眠`, tags: [method] }; },
    diaper: () => { const type = formValue(formData, "diaperType", "湿"); return { title: "更换尿布", detail: note || `${type}尿布，已完成更换`, tags: [type] }; },
    soothing: () => { const method = formValue(formData, "method", "抱哄"); const outcome = formValue(formData, "outcome", "明显缓解"); return { title: `${method}后${outcome}`, detail: note || `本次安抚结果：${outcome}`, tags: [method, outcome] }; },
    temperature: () => { const value = formValue(formData, "temperature", "36.7"); const measure = formValue(formData, "measure", "腋温"); return { title: `体温 ${value}℃`, detail: note || `${measure}测量，仅作家庭记录`, tags: [measure] }; },
    note: () => { const type = formValue(formData, "noteType", "家庭备注"); return { title: type, detail: note || "新增一条家庭照护备注", tags: ["家庭可见"] }; }
  };
  const content = (builders[state.logType] || builders.note)();
  state.events.unshift({ id: Date.now(), type: state.logType, at: at.toISOString(), ...content, author: "爸爸", manual: true });
  saveEvents();
  closeLog();
  showToast(`${EVENT_META[state.logType].label}记录已保存`);
}

function resetSafetyFlow() {
  clearInterval(state.timerId);
  cancelAnimationFrame(state.animationId);
  state.stream?.getTracks().forEach(track => track.stop());
  state.recording = false;
  state.safetyAnswers = {};
  state.safetyResult = null;
  state.safetyEventSaved = false;
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
  button.textContent = completed === names.length ? "查看安全分流结果" : `还需回答 ${names.length - completed} 项`;
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

function showSafetyResult(kind, reasons) {
  const configs = {
    emergency: {
      level: "紧急求助",
      title: "请立即寻求紧急医疗帮助",
      summary: "你报告了可能需要立即处理的危险体征。本次不会继续录音或需求分析。",
      guidanceTitle: "不要等待哭声分析结果",
      guidanceBody: "请立即联系当地急救服务或前往急诊。如在中国大陆，可拨打 120。请始终遵循现场专业人员的指示。",
      primary: "查看紧急求助方式",
      icon: "!"
    },
    concerning: {
      level: "需要尽快专业评估",
      title: "这次先不继续普通需求分析",
      summary: "当前信息不能安全归入饥饿、困倦等常见需求，建议优先联系专业医疗人员。",
      guidanceTitle: "请尽快联系儿科或医疗咨询渠道",
      guidanceBody: "说明哭声变化和伴随状态；如果呼吸、肤色或反应出现异常，请升级为紧急求助。",
      primary: "记录本次情况并返回今天",
      icon: "!"
    },
    anomaly: {
      level: "异常哭声 · 超出模型能力",
      title: "这次不显示需求概率",
      summary: "这段声音与禾禾的个人基线差异较大，演示模型无法将它安全归入常见需求。",
      guidanceTitle: "请结合整体状态进行专业评估",
      guidanceBody: "这不是疾病诊断。若哭声明显不同于平时、持续无法安抚或伴随其他异常，请尽快联系专业医疗人员。",
      primary: "记录本次情况并返回今天",
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
  $("#safetyReasonList").innerHTML = reasons.map(reason => `<li><span>!</span><p>${reason}</p></li>`).join("");
  saveSafetyEvent();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveSafetyEvent() {
  if (!state.safetyResult || state.safetyEventSaved) return;
  const labels = { emergency: "紧急安全分流", concerning: "建议尽快专业评估", anomaly: "异常哭声 · 超出模型能力" };
  state.events.unshift({
    id: Date.now(),
    type: "safety",
    at: state.safetyResult.at,
    title: labels[state.safetyResult.kind],
    detail: state.safetyResult.reasons.join("；"),
    tags: ["安全分流", state.safetyResult.kind === "emergency" ? "紧急" : "未继续需求分析"],
    author: "爸爸"
  });
  state.safetyEventSaved = true;
  saveEvents();
}

function resetRecorder() {
  clearInterval(state.timerId);
  cancelAnimationFrame(state.animationId);
  if (state.recording) state.stream?.getTracks().forEach(track => track.stop());
  state.recording = false;
  state.remaining = 10;
  state.levels = [];
  $("#timerValue").textContent = "10";
  $("#recordStatus").textContent = "准备好后轻触按钮";
  $("#recordButton").disabled = false;
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
  ctx.strokeStyle = "rgba(64,95,83,.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 7) {
    const y = canvas.height / 2 + Math.sin(x / 25) * 6 + Math.sin(x / 9) * 2;
    x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
}

async function toggleRecording() {
  if (state.recording) return finishRecording();
  if (!navigator.mediaDevices?.getUserMedia) {
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
    state.remaining = 10;
    $("#recordButton").classList.add("recording");
    $(".demo-actions").classList.add("hidden");
    $("#recordStatus").textContent = "正在筛选有效哭声…";
    updateQuality("good", "正在检测声音");
    visualizeWave();
    state.timerId = setInterval(() => {
      state.remaining -= 1;
      $("#timerValue").textContent = state.remaining;
      if (state.remaining <= 0) finishRecording();
    }, 1000);
  } catch (error) {
    updateQuality("low", "未获得麦克风权限");
    $("#recordStatus").textContent = "可在浏览器设置中允许麦克风，或体验演示分析";
    showToast("麦克风未授权，本次不会采集任何音频");
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
    ctx.strokeStyle = "#5d796c";
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

function finishRecording() {
  if (!state.recording) return;
  state.recording = false;
  clearInterval(state.timerId);
  cancelAnimationFrame(state.animationId);
  state.stream?.getTracks().forEach(track => track.stop());
  state.audioContext?.close();
  $("#recordButton").classList.remove("recording");
  runInference("normal", false);
}

function runInference(mode = "normal", demo = true) {
  clearInterval(state.timerId);
  if (state.recording) {
    state.recording = false;
    state.stream?.getTracks().forEach(track => track.stop());
  }
  $("#recordButton").disabled = true;
  $("#recordStatus").textContent = "正在分析声音、状态与个人记录…";
  updateQuality("good", "声音已采集");
  const messages = ["正在筛选有效哭声…", "正在检查声音适用范围…", "正在对照个人声音基线…"];
  let index = 0;
  const progress = setInterval(() => { $("#recordStatus").textContent = messages[Math.min(index++, messages.length - 1)]; }, 550);
  setTimeout(() => {
    clearInterval(progress);
    if (mode === "anomaly") {
      $("#recordButton").disabled = false;
      return showSafetyResult("anomaly", ["声音音高与音质明显偏离禾禾过去的可靠录音", "演示模型将这段声音识别为分布外输入，无法安全生成需求概率"]);
    }
    state.analysisId += 1;
    const mean = state.levels.length ? state.levels.reduce((a, b) => a + b, 0) / state.levels.length : 6;
    const scenarios = mean < 2.4 ? [[44, 34, 22], [51, 30, 19]] : [[16, 78, 6], [76, 16, 8], [22, 58, 20]];
    const probabilities = scenarios[(state.analysisId - 1) % scenarios.length];
    showResult(probabilities, demo);
  }, 2100);
}

function showResult(probabilities, demo) {
  const labels = ["饥饿", "困倦", "一般性不适"];
  const max = Math.max(...probabilities);
  const top = probabilities.indexOf(max);
  const sorted = [...probabilities].sort((a, b) => b - a);
  const confidence = max >= 75 && max - sorted[1] >= 25 ? "high" : max >= 55 ? "medium" : "low";
  state.activeResult = { probabilities, top, confidence, demo, saved: false };
  $("#topProbability").textContent = `${max}%`;
  $("#topReason").textContent = labels[top];
  $("#confidenceLabel").textContent = confidence === "high" ? "较高置信度" : confidence === "medium" ? "中等置信度 · 建议结合排查" : "低置信度 · 建议逐项排查";
  $("#resultSummary").textContent = confidence === "high" ? ["声音与近期喂养间隔都更接近饥饿信号。", "声音节奏与较长清醒时长都更接近困倦信号。", "声音表现不集中，建议先检查身体与环境状态。"][top] : "几种可能性仍较接近，仅凭这段声音不能可靠判断。";
  $("#matchRing").style.background = `conic-gradient(${confidence === "low" ? "var(--peach)" : "var(--moss-dark)"} 0 ${max}%, #e0ddd5 ${max}% 100%)`;
  ["hunger", "sleepy", "discomfort"].forEach((key, i) => {
    $(`#${key}Value`).textContent = `${probabilities[i]}%`;
    setTimeout(() => { $(`#${key}Bar`).style.width = `${probabilities[i]}%`; }, 80);
  });
  const actions = [
    ["按熟悉的方式喂养", "距离上次喂养已有一段时间。按家庭日常方式尝试，并观察宝宝是否主动寻找或逐渐平静。"],
    ["降低刺激，准备入睡", "调暗灯光、减少说话与逗弄，使用禾禾熟悉的抱哄方式，观察 10 分钟。"],
    ["先检查身体与环境", "检查尿布、衣物松紧、体温与姿势；若状态异常或持续剧烈哭闹，请及时寻求专业帮助。"]
  ];
  $("#actionTitle").textContent = actions[top][0];
  $("#actionDescription").textContent = actions[top][1];
  $("#actionCard").classList.toggle("hidden", confidence !== "high");
  $("#checklistCard").classList.toggle("hidden", confidence === "high");
  $("#audioQuality").textContent = state.levels.length && state.levels.reduce((a, b) => a + b, 0) / state.levels.length < 2.4 ? "声音偏轻" : "清晰";
  const evidence = top === 0
    ? [["支持饥饿", "距离上次喂养已有一段时间。"], ["支持饥饿", "哭声节奏与禾禾以往饥饿记录相似。"]]
    : top === 1
      ? [["支持困倦", "哭声强度逐渐回落，接近以往困倦时的节奏。"], ["支持困倦", "当前清醒时长比近 7 天常见时长多约 18 分钟。"]]
      : [["建议检查", "声音特征分散，无法对应到单一日常需求。"], ["建议检查", "需要结合尿布、姿势、体温和精神状态。"]];
  $("#evidenceList").innerHTML = evidence.map(item => `<li class="support"><span>↑</span><p><b>${item[0]}</b>${item[1]}</p></li>`).join("") + `<li class="neutral"><span>·</span><p><b>仍有不确定</b>${demo ? "本次为模拟分析，不具备真实识别能力。" : "录音中可能存在少量背景声音。"}</p></li>`;
  $("#recorderStage").classList.add("hidden");
  $("#resultStage").classList.remove("hidden");
  $("#recordButton").disabled = false;
  if (!state.activeResult.saved) {
    state.events.unshift({ id: Date.now(), type: "cry", at: new Date().toISOString(), title: `哭闹 · 更可能${labels[top]}`, detail: `模拟分析匹配度 ${max}%，${confidence === "high" ? "较高" : confidence === "medium" ? "中等" : "低"}置信度`, tags: ["安全问询已完成", "模拟分析", "待反馈"], author: "爸爸" });
    state.activeResult.saved = true;
    saveEvents();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startObservation() {
  state.observationSeconds = 600;
  $("#observeModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
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

function closeObservation() {
  $("#observeModal").classList.add("hidden");
  document.body.style.overflow = "";
}

function saveOutcome(value) {
  const label = { relieved: "明显缓解", some: "有一点缓解", none: "没有缓解" }[value];
  state.events.unshift({ id: Date.now(), type: "soothing", at: new Date().toISOString(), title: `抱哄后${label}`, detail: `降低刺激并观察，结果：${label}`, tags: ["抱哄 + 降低刺激", label], author: "爸爸" });
  saveEvents();
  closeObservation();
  showToast("反馈已保存，已更新禾禾的个人记录");
}

function renderInsights() {
  const cries = state.events.filter(event => event.type === "cry").length;
  $("#weekCryCount").innerHTML = `${Math.max(18, cries + 14)}<em>次</em>`;
  const criesByDay = [2, 4, 3, 5, 2, 1, 3];
  const sleepByDay = [8, 7, 8, 5, 8, 9, 8];
  $("#comboChart").innerHTML = criesByDay.map((value, index) => `<div class="combo-col"><div class="combo-bars"><i style="height:${value * 18}px"></i><i style="height:${sleepByDay[index] * 10}px"></i></div><small>周${"一二三四五六日"[index]}</small></div>`).join("");
  const heat = [0,0,0,1,0,1,1,0,1,1,0,1,1,2,1,1,2,2,4,4,3,2,1,0];
  $("#heatmap").innerHTML = heat.map(level => `<i class="l${level}"></i>`).join("");
}

function initializeDate() {
  const now = new Date();
  $("#dateLabel").textContent = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(now);
  const hour = now.getHours();
  $("#todayTitle").innerHTML = `${hour < 11 ? "早上" : hour < 18 ? "下午" : "晚上"}好，<em>慢慢来。</em>`;
}

$$('[data-nav]').forEach(button => button.addEventListener("click", () => {
  navigate(button.dataset.nav);
  if (button.dataset.nav === "listen") resetSafetyFlow();
}));
$("#listenHero").addEventListener("click", () => { navigate("listen"); resetSafetyFlow(); });
$$('[data-log]').forEach(button => button.addEventListener("click", () => openLog(button.dataset.log)));
$$('#typeSelector [data-type]').forEach(button => button.addEventListener("click", () => { state.logType = button.dataset.type; renderLogFields(); }));
$("#closeLogModal").addEventListener("click", closeLog);
$("#logModal").addEventListener("click", event => { if (event.target === event.currentTarget) closeLog(); });
$("#logForm").addEventListener("submit", submitLog);
$("#safetyForm").addEventListener("change", updateSafetyProgress);
$("#safetyForm").addEventListener("submit", submitSafety);
$("#caregiverConcernButton").addEventListener("click", () => showSafetyResult("concerning", ["照护者主动表示宝宝这次的状态让人担心"]));
$("#editSafetyButton").addEventListener("click", resetSafetyFlow);
$("#restartSafetyButton").addEventListener("click", resetSafetyFlow);
$$('#timelineFilters [data-filter]').forEach(button => button.addEventListener("click", () => {
  state.filter = button.dataset.filter;
  $$('#timelineFilters [data-filter]').forEach(item => item.classList.toggle("active", item === button));
  renderTimeline();
}));
$("#recordButton").addEventListener("click", toggleRecording);
$("#demoButton").addEventListener("click", () => runInference("normal", true));
$("#anomalyDemoButton").addEventListener("click", () => runInference("anomaly", true));
$("#newAnalysisButton").addEventListener("click", resetRecorder);
$("#safetyPrimaryButton").addEventListener("click", () => {
  if (state.safetyResult?.kind === "emergency") {
    showToast("如在中国大陆，请立即拨打 120 或前往急诊");
    return;
  }
  navigate("today");
  showToast("安全分流记录已保存在家庭时间线");
});
$("#safetySummaryButton").addEventListener("click", () => showToast("摘要将包含安全问询、哭声变化和时间信息；不会自动分享"));
$("#startObserveButton").addEventListener("click", startObservation);
$("#closeObserve").addEventListener("click", closeObservation);
$("#finishLaterButton").addEventListener("click", () => { closeObservation(); showToast("观察仍在进行，可稍后从时间线补充反馈"); });
$$('[data-outcome]').forEach(button => button.addEventListener("click", () => saveOutcome(button.dataset.outcome)));

const simpleToasts = {
  babySwitch: "多宝宝切换将在 P2 版本开放",
  notificationButton: "没有新的重要提醒",
  caregiverButton: "爸爸从 13:04 开始照护",
  handoffButton: "已生成过去 6 小时照护摘要",
  customizeQuick: "快捷记录排序将在设置中开放",
  endShiftButton: "交接摘要已准备，确认后可结束本次照护",
  probabilityInfo: "概率来自声音和上下文的模拟结果，不代表医学诊断",
  otherActionsButton: "还可尝试拍嗝、检查尿布或调整姿势",
  reportButton: "报告预览将在 P1 后续迭代开放，不会自动分享",
  editProfileButton: "宝宝档案编辑将在下一迭代开放",
  inviteButton: "家庭邀请需要云同步能力，将在后续接入",
  notificationSettings: "提醒设置将在下一迭代开放",
  knowledgeButton: "知识内容需完成专业审核后开放",
  privacyButton: "原始音频默认不上传；分析、训练和分享将分别授权",
  exportButton: "导出前将允许选择时间范围和数据类型"
};
Object.entries(simpleToasts).forEach(([id, message]) => $(`#${id}`)?.addEventListener("click", () => showToast(message)));
$("#completeHandoff").addEventListener("click", event => { event.currentTarget.textContent = "已读"; event.currentTarget.disabled = true; showToast("已向妈妈同步阅读状态"); });
$$('[data-insight-detail]').forEach(button => button.addEventListener("click", () => { navigate("timeline"); state.filter = "cry"; $$('#timelineFilters [data-filter]').forEach(item => item.classList.toggle("active", item.dataset.filter === "cry")); renderTimeline(); }));

initializeDate();
renderToday();
renderTimeline();
renderInsights();
drawIdleWave();
