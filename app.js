const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  stream: null,
  audioContext: null,
  analyser: null,
  recorder: null,
  chunks: [],
  timer: null,
  remaining: 10,
  recording: false,
  levels: [],
  animationId: null,
  result: null,
  history: JSON.parse(localStorage.getItem("crysense-history") || "null") || [
    { id: 1, at: new Date(Date.now() - 2 * 3600000).toISOString(), reason: "饥饿", probability: 76, feedback: "有帮助" },
    { id: 2, at: new Date(Date.now() - 8 * 3600000).toISOString(), reason: "困倦", probability: 69, feedback: "还不确定" },
    { id: 3, at: new Date(Date.now() - 27 * 3600000).toISOString(), reason: "身体不适", probability: 58, feedback: "有帮助" }
  ]
};

const views = { home: $("#homeView"), analysis: $("#analysisView"), result: $("#resultView"), insights: $("#insightsView") };

function navigate(name) {
  Object.values(views).forEach(view => view.classList.remove("active"));
  views[name].classList.add("active");
  $$(".bottom-nav button").forEach(button => button.classList.toggle("active", button.dataset.nav === name));
  $(".topbar").style.display = ["analysis", "result"].includes(name) ? "none" : "flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "insights") renderInsights();
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2800);
}

function formatDate() {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
}

function prepareAnalysis() {
  resetRecorder();
  navigate("analysis");
  drawIdleWave();
}

function drawIdleWave() {
  const canvas = $("#waveform");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(83,109,98,.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= canvas.width; x += 8) {
    const y = canvas.height / 2 + Math.sin(x / 24) * 5 + Math.sin(x / 9) * 2;
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

async function toggleRecording() {
  if (state.recording) return finishRecording();
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    state.analyser = state.audioContext.createAnalyser();
    state.analyser.fftSize = 256;
    const source = state.audioContext.createMediaStreamSource(state.stream);
    source.connect(state.analyser);
    state.recorder = new MediaRecorder(state.stream);
    state.chunks = [];
    state.levels = [];
    state.recorder.ondataavailable = event => { if (event.data.size) state.chunks.push(event.data); };
    state.recorder.start();
    state.recording = true;
    state.remaining = 10;
    $("#recordButton").classList.add("recording");
    $("#recordButton").setAttribute("aria-label", "停止录音");
    $("#recordStatus").textContent = "正在聆听宝宝的哭声…";
    $("#analysisEyebrow").textContent = "正在录音";
    $("#demoButton").classList.add("hidden");
    updateQuality("good", "正在检测声音");
    visualize();
    state.timer = setInterval(() => {
      state.remaining -= 1;
      $("#timerValue").textContent = state.remaining;
      if (state.remaining <= 0) finishRecording();
    }, 1000);
  } catch (error) {
    updateQuality("low", "无法使用麦克风");
    $("#recordStatus").textContent = "请在浏览器设置中允许麦克风访问";
    showToast("未获得麦克风权限，可使用下方演示分析");
  }
}

function visualize() {
  const canvas = $("#waveform");
  const ctx = canvas.getContext("2d");
  const data = new Uint8Array(state.analyser.frequencyBinCount);
  const draw = () => {
    state.animationId = requestAnimationFrame(draw);
    state.analyser.getByteTimeDomainData(data);
    const level = data.reduce((sum, value) => sum + Math.abs(value - 128), 0) / data.length;
    state.levels.push(level);
    if (state.levels.length % 15 === 0) updateQuality(level > 2.4 ? "good" : "low", level > 2.4 ? "声音采集良好" : "声音有些轻");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#647d71";
    ctx.lineWidth = 3;
    ctx.beginPath();
    data.forEach((value, index) => {
      const x = index / (data.length - 1) * canvas.width;
      const y = value / 255 * canvas.height;
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  draw();
}

function updateQuality(className, text) {
  const pill = $("#qualityPill");
  pill.className = `quality-pill ${className || ""}`;
  $("b", pill).textContent = text;
}

function finishRecording() {
  if (!state.recording) return;
  state.recording = false;
  clearInterval(state.timer);
  cancelAnimationFrame(state.animationId);
  if (state.recorder?.state !== "inactive") state.recorder.stop();
  state.stream?.getTracks().forEach(track => track.stop());
  state.audioContext?.close();
  $("#recordButton").classList.remove("recording");
  $("#recordStatus").textContent = "正在整理声音特征…";
  $("#analysisEyebrow").textContent = "AI 分析中";
  updateQuality("good", "录音已完成");
  runDemoInference(false);
}

function runDemoInference(isDemo = true) {
  clearInterval(state.timer);
  if (state.recording) {
    state.recording = false;
    state.stream?.getTracks().forEach(track => track.stop());
  }
  $("#recordButton").disabled = true;
  $("#recordStatus").textContent = "正在比对节奏、音高与近期记录…";
  $("#analysisEyebrow").textContent = "AI 分析中";
  let ticks = 0;
  const copy = ["正在筛选有效哭声…", "正在分析声音节奏…", "正在生成照护参考…"];
  const progress = setInterval(() => { $("#recordStatus").textContent = copy[Math.min(ticks++, 2)]; }, 600);
  setTimeout(() => {
    clearInterval(progress);
    const meanLevel = state.levels.length ? state.levels.reduce((a,b) => a+b, 0) / state.levels.length : 6;
    const scenarios = meanLevel < 2.4
      ? [[44, 32, 24], [51, 29, 20]]
      : [[78, 14, 8], [18, 70, 12], [24, 20, 56]];
    const probabilities = scenarios[Math.floor(Math.random() * scenarios.length)];
    showResult(probabilities, isDemo || !state.levels.length);
  }, 2100);
}

function showResult(probabilities, demo) {
  const labels = ["饥饿", "困倦", "身体不适"];
  const displayLabels = ["饿了", "困了", "有些不舒服"];
  const index = probabilities.indexOf(Math.max(...probabilities));
  const sorted = [...probabilities].sort((a,b) => b-a);
  const confidence = sorted[0] >= 75 && sorted[0] - sorted[1] >= 25 ? "high" : sorted[0] >= 55 ? "medium" : "low";
  state.result = { probabilities, index, confidence, at: new Date().toISOString(), demo };
  $("#topProbability").textContent = `${probabilities[index]}%`;
  $("#topReason").textContent = displayLabels[index];
  $("#confidenceLabel").textContent = confidence === "high" ? "较高置信度" : confidence === "medium" ? "中等置信度 · 建议排查" : "低置信度 · 建议排查";
  $("#confidenceRing").style.background = `conic-gradient(${confidence === "low" ? "#c59a7e" : "var(--sage-dark)"} 0 ${probabilities[index]}%, #e2dfd7 ${probabilities[index]}% 100%)`;
  const summaries = ["哭声节奏与宝宝的近期喂养间隔，都更接近饥饿信号。", "哭声强度逐渐回落，更接近疲倦时的表达。", "声音特征不够集中，建议结合宝宝当前身体状态逐项检查。"];
  $("#resultSummary").textContent = confidence !== "high" ? "几种可能性较为接近，仅凭这段声音还不能可靠判断。" : summaries[index];
  ["hunger", "sleepy", "discomfort"].forEach((key, i) => {
    $(`#${key}Value`).textContent = `${probabilities[i]}%`;
    setTimeout(() => { $(`#${key}Bar`).style.width = `${probabilities[i]}%`; }, 80);
  });
  const advice = [
    ["按熟悉的方式喂养", "距离上次喂奶约 2 小时。观察宝宝是否主动寻找、吮吸或逐渐平静。"],
    ["减少刺激，准备入睡", "调暗灯光、降低声音，使用宝宝熟悉的安抚方式并留意困倦信号。"],
    ["先检查身体与环境", "检查尿布、衣物松紧、体温和姿势；若出现异常信号或持续剧烈哭闹，请及时就医。"]
  ];
  $("#adviceTitle").textContent = advice[index][0];
  $("#adviceBody").textContent = advice[index][1];
  $("#adviceCard").classList.toggle("hidden", confidence !== "high");
  $("#checklistCard").classList.toggle("hidden", confidence === "high");
  $("#qualityResult").textContent = state.levels.length && state.levels.reduce((a,b)=>a+b,0)/state.levels.length < 2.4 ? "声音偏轻" : "音频清晰";
  navigate("result");
  $("#recordButton").disabled = false;
}

function submitFeedback(value, button) {
  $$("[data-feedback]").forEach(item => item.classList.remove("selected"));
  button.classList.add("selected");
  const feedbackLabel = { helpful: "有帮助", unsure: "还不确定", wrong: "不太符合" }[value];
  if (!state.result.saved) {
    state.history.unshift({ id: Date.now(), at: state.result.at, reason: ["饥饿", "困倦", "身体不适"][state.result.index], probability: state.result.probabilities[state.result.index], feedback: feedbackLabel });
    state.result.saved = true;
  } else {
    state.history[0].feedback = feedbackLabel;
  }
  localStorage.setItem("crysense-history", JSON.stringify(state.history));
  $("#feedbackThanks").classList.remove("hidden");
}

function renderInsights() {
  const data = [2, 4, 3, 5, 2, 3, Math.max(1, state.history.filter(item => new Date(item.at).toDateString() === new Date().toDateString()).length)];
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  $("#weeklyChart").innerHTML = data.map((value, i) => `<div class="chart-column ${i === 6 ? "today" : ""}"><i style="height:${value / 6 * 120}px"></i><small>周${days[i]}</small></div>`).join("");
  $("#weekCount").textContent = `${data.reduce((a,b)=>a+b,0)} 次`;
  const list = state.history.slice(0, 5);
  $("#historyList").innerHTML = list.length ? list.map(item => {
    const date = new Date(item.at);
    const time = new Intl.DateTimeFormat("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" }).format(date);
    return `<article class="history-item"><span class="history-icon">${item.reason === "饥饿" ? "◌" : item.reason === "困倦" ? "☾" : "✦"}</span><div><strong>${item.reason}</strong><small>${time} · ${item.feedback}</small></div><span>${item.probability}%</span></article>`;
  }).join("") : `<p class="lead">还没有记录。完成一次分析并反馈后，会显示在这里。</p>`;
  const todayRecords = state.history.filter(item => new Date(item.at).toDateString() === new Date().toDateString());
  $("#todayCount").textContent = todayRecords.length || 0;
  $("#todayMinutes").textContent = todayRecords.length * 4;
}

function resetRecorder() {
  clearInterval(state.timer);
  cancelAnimationFrame(state.animationId);
  if (state.recording) state.stream?.getTracks().forEach(track => track.stop());
  state.recording = false;
  state.remaining = 10;
  state.levels = [];
  $("#timerValue").textContent = "10";
  $("#recordStatus").textContent = "准备好后轻触按钮";
  $("#analysisEyebrow").textContent = "准备聆听";
  $("#recordButton").classList.remove("recording");
  $("#recordButton").disabled = false;
  $("#demoButton").classList.remove("hidden");
  updateQuality("", "等待开始");
}

$("#todayLabel").textContent = formatDate();
$("#startButton").addEventListener("click", prepareAnalysis);
$("#recordButton").addEventListener("click", toggleRecording);
$("#demoButton").addEventListener("click", () => runDemoInference(true));
$("#cancelAnalysis").addEventListener("click", () => { resetRecorder(); navigate("home"); });
$$('[data-nav]').forEach(button => button.addEventListener("click", () => button.dataset.nav === "analysis" ? prepareAnalysis() : navigate(button.dataset.nav)));
$$('[data-feedback]').forEach(button => button.addEventListener("click", () => submitFeedback(button.dataset.feedback, button)));
$("#safetyMore").addEventListener("click", () => showToast("若宝宝呼吸困难、发绀、抽搐、反应异常或持续剧烈哭闹，请立即就医。"));
$("#profileButton").addEventListener("click", () => showToast("宝宝档案将在下一版本开放编辑"));
$("#clearHistory").addEventListener("click", () => { state.history = []; localStorage.setItem("crysense-history", "[]"); renderInsights(); showToast("演示记录已清除"); });
renderInsights();
