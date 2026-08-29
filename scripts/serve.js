import { createServer } from "node:http";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
try {
  const localEnv = await readFile(path.join(projectRoot, ".env"), "utf8");
  localEnv.split(/\r?\n/).forEach(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  });
} catch {
  // Production environments normally inject variables directly; a local .env is optional.
}
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4174);
const miniMaxBase = (process.env.MINIMAX_API_BASE || "https://api.minimax.io/v1").replace(/\/$/, "");
const miniMaxKey = process.env.MINIMAX_API_KEY || "";
const configuredPublicBase = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
const runtimeRoot = path.join(projectRoot, "runtime");

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"], [".png", "image/png"], [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"], [".svg", "image/svg+xml"]
]);

const styleConfigs = {
  sticker: {
    aspectRatio: "1:1",
    promptOptimizer: false,
    prompt: "Create a photorealistic Korean-style giant-head photo sticker from reference image 1. Preserve the baby's exact identity, infant age, facial proportions, skin tone, eye shape and recognizable expression. Use an extreme close-up centered head portrait: only the complete head and a tiny amount of neck, no torso, no hands, no room or original background. Keep realistic skin and hair texture, bright high-key studio lighting and a pure white seamless background. Add a clean white die-cut sticker outline around the hair and chin with a very soft pale-gray contact shadow. The result must look like a professionally retouched real photo sticker, cute and lively, not an illustration, not 3D, not a painting, not an adult, no text, no watermark, no collage."
  },
  minimax: {
    aspectRatio: "3:4",
    promptOptimizer: true,
    prompt: "Create an imaginative, polished MiniMax-native portrait artwork from reference image 1. Preserve the baby's identity, infant age and recognizable facial features while freely developing a delightful scene, expressive lighting, layered details and a refined editorial finish. Keep one clear baby subject, family-friendly content, no visible text, no watermark and no collage."
  },
  comic: {
    aspectRatio: "3:4",
    promptOptimizer: false,
    prompt: "Reference image 1 is a two-panel reference board with a narrow identity panel on the LEFT and a deliberately larger style-and-composition panel on the RIGHT. Preserve the baby's identity, infant age, facial structure and recognizable expression from the left panel. Treat the entire right panel as the dominant and mandatory target. Closely match its framing, camera angle, subject scale, pose silhouette, spatial arrangement and background composition, as well as its medium, line quality, brush texture, dominant palette, saturation, contrast, shape simplification, shading and edge treatment. Replace the right-panel character with the baby from the left panel; never copy the right-panel person's identity, visible words, logos or watermark. The family should immediately recognize both the uploaded baby's appearance and the uploaded reference's composition and visual style. Output only one coherent finished artwork: no split screen, no reference board, no before-and-after layout, no collage and no captions."
  },
  custom: {
    aspectRatio: "3:4",
    promptOptimizer: true,
    prompt: "Create one polished, family-friendly portrait artwork from reference image 1. Preserve the baby's identity, infant age and recognizable facial features while following the user's creative direction. Keep one clear baby subject, coherent composition, no visible text, no watermark and no collage."
  }
};

function buildMeasuredStyleGuidance(signals) {
  if (!signals || typeof signals !== "object") return "";
  const options = {
    brightness: { light: "high-key and luminous", balanced: "mid-key and balanced", dark: "deep-toned and shadow-rich" },
    saturation: { vivid: "vividly saturated", balanced: "moderately saturated", muted: "muted and restrained" },
    contrast: { strong: "strong contrast", balanced: "moderate contrast", soft: "soft low contrast" },
    temperature: { warm: "warm color temperature", neutral: "neutral color temperature", cool: "cool color temperature" },
    edges: { crisp: "crisp graphic edges", textured: "visibly textured edges", soft: "soft blended edges" }
  };
  const descriptors = Object.entries(options).map(([key, choices]) => choices[signals[key]]).filter(Boolean);
  const palette = Array.isArray(signals.palette)
    ? signals.palette.filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 5)
    : [];
  if (!descriptors.length && !palette.length) return "";
  return ` Measured properties of the uploaded style reference are: ${descriptors.join(", ")}${palette.length ? `; dominant palette ${palette.join(", ")}` : ""}. Treat these measured properties as hard visual constraints, not optional suggestions.`;
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin"
  });
  response.end(JSON.stringify(body));
}

function resolvePublicBase(request) {
  if (configuredPublicBase) return configuredPublicBase;
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const requestHost = forwardedHost || String(request.headers.host || "").trim();
  if (!requestHost) return "";
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto === "https" ? "https" : "http";
  return `${protocol}://${requestHost}`;
}

function isPublicHttpBase(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isPrivateAddress = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" ||
      hostname.startsWith("10.") || hostname.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    return url.protocol === "https:" && !isPrivateAddress;
  } catch {
    return false;
  }
}

async function readJson(request, limit = 12 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl || "/", `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const absolutePath = path.resolve(projectRoot, `.${pathname}`);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return absolutePath;
}

async function miniMaxRequest(endpoint, body) {
  const response = await fetch(`${miniMaxBase}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${miniMaxKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.base_resp?.status_code > 0) {
    const message = payload.base_resp?.status_msg || payload.error?.message || payload.message || `MiniMax 请求失败 (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function parseImageDataUrl(value, label = "照片") {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const error = new Error(`${label}格式无效，请使用 JPG、PNG 或 WebP。`);
    error.statusCode = 400;
    throw error;
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    const error = new Error(`${label}需小于 8 MB。`);
    error.statusCode = 413;
    throw error;
  }
  const extension = match[1].endsWith("png") ? "png" : match[1].endsWith("webp") ? "webp" : "jpg";
  return { buffer, extension };
}

async function persistReferenceImage(parsed, sourceDir) {
  const sourceName = `${randomUUID()}.${parsed.extension}`;
  const sourcePath = path.join(sourceDir, sourceName);
  await writeFile(sourcePath, parsed.buffer);
  return { sourceName, sourcePath };
}

async function handleImageGeneration(request, response) {
  const publicBase = resolvePublicBase(request);
  if (!miniMaxKey || !isPublicHttpBase(publicBase)) {
    return writeJson(response, 503, { configured: false, message: "MiniMax 尚未配置：需要服务端 MINIMAX_API_KEY 和 HTTPS 公网域名。" });
  }
  const body = await readJson(request, 24 * 1024 * 1024);
  if (body.consent !== true) return writeJson(response, 400, { message: "需要明确同意本次照片上传生成。" });
  const style = styleConfigs[body.style] ? body.style : "sticker";
  const customPrompt = style === "custom"
    ? String(body.customPrompt || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400)
    : "";
  if (style === "custom" && customPrompt.length < 4) return writeJson(response, 400, { message: "请先填写至少 4 个字的生成描述。" });
  const referenceImage = parseImageDataUrl(body.imageDataUrl, style === "comic" ? "合成参考图" : "宝宝照片");
  const sourceDir = path.join(runtimeRoot, "uploads");
  await mkdir(sourceDir, { recursive: true });
  const identitySource = await persistReferenceImage(referenceImage, sourceDir);
  const subjectReference = [
    { type: "character", image_file: `${publicBase}/runtime/uploads/${identitySource.sourceName}` }
  ];
  const config = styleConfigs[style];
  const measuredStyleGuidance = style === "comic" ? buildMeasuredStyleGuidance(body.styleSignals) : "";
  let payload;
  try {
    payload = await miniMaxRequest("/image_generation", {
      model: "image-01",
      prompt: `${config.prompt}${measuredStyleGuidance}${customPrompt ? ` User creative direction: ${customPrompt}.` : ""} The baby's name is ${String(body.babyName || "宝宝").slice(0, 12)}; never render the name as visible text.`,
      subject_reference: subjectReference,
      aspect_ratio: config.aspectRatio,
      response_format: "base64",
      n: 1,
      prompt_optimizer: config.promptOptimizer
    });
  } finally {
    await unlink(identitySource.sourcePath).catch(() => {});
  }

  const encoded = payload.data?.image_base64?.[0] || payload.data?.images?.[0]?.base64 || payload.images?.[0]?.base64;
  const remoteUrl = payload.data?.image_urls?.[0] || payload.data?.images?.[0]?.url || payload.images?.[0]?.url;
  const generatedDir = path.join(runtimeRoot, "generated");
  await mkdir(generatedDir, { recursive: true });
  const outputName = `${randomUUID()}.jpg`;
  if (encoded) {
    await writeFile(path.join(generatedDir, outputName), Buffer.from(encoded, "base64"));
  } else if (remoteUrl) {
    const remote = await fetch(remoteUrl);
    if (!remote.ok) throw new Error("MiniMax 结果下载失败");
    await writeFile(path.join(generatedDir, outputName), Buffer.from(await remote.arrayBuffer()));
  } else {
    throw new Error("MiniMax 未返回可用图像");
  }
  return writeJson(response, 200, { provider: "minimax", images: [`/runtime/generated/${outputName}`] });
}

function extractJson(text) {
  const cleaned = String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("MiniMax 未返回结构化结果");
  return JSON.parse(match[0]);
}

async function handleCryAnalysis(request, response) {
  if (!miniMaxKey) return writeJson(response, 503, { configured: false, message: "MiniMax 文本推理服务尚未配置。" });
  const body = await readJson(request, 256 * 1024);
  const levels = Array.isArray(body.levels) ? body.levels.slice(-400).map(Number).filter(Number.isFinite) : [];
  if (levels.length < 8) return writeJson(response, 400, { message: "有效声音特征不足，请重新录制。" });
  const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  const peak = Math.max(...levels);
  const variance = levels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / levels.length;
  const payload = await miniMaxRequest("/chat/completions", {
    model: process.env.MINIMAX_TEXT_MODEL || "MiniMax-M2.7",
    temperature: 0.15,
    messages: [
      { role: "system", content: "你是婴儿照护应用的非医疗声音特征解释器。你没有收到原始音频，只收到客户端提取的响度序列统计与照护上下文。不可诊断疾病，不可声称能从这些特征识别病理。只输出 JSON，字段为 probabilities(hunger,sleepy,discomfort，整数且和为100)、confidence(high|medium|low)、summary、evidence(2条短句)。证据必须明确包含上下文和声学特征的局限。" },
      { role: "user", content: JSON.stringify({ acousticFeatures: { sampleCount: levels.length, meanLoudness: Number(mean.toFixed(3)), peakLoudness: Number(peak.toFixed(3)), variance: Number(variance.toFixed(3)) }, context: body.context || {}, safetyScreenPassed: body.safetyScreenPassed === true }) }
    ]
  });
  const result = extractJson(payload.choices?.[0]?.message?.content);
  return writeJson(response, 200, { provider: "minimax-text-reasoning", audioUploaded: false, ...result });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return writeJson(response, 200, { ok: true, service: "crysense" });
    }
    if (request.method === "GET" && url.pathname === "/api/minimax/status") {
      return writeJson(response, 200, {
        imageConfigured: Boolean(miniMaxKey && isPublicHttpBase(resolvePublicBase(request))),
        cryReasoningConfigured: Boolean(miniMaxKey),
        audioInputSupported: false
      });
    }
    if (request.method === "POST" && url.pathname === "/api/minimax/image") return await handleImageGeneration(request, response);
    if (request.method === "POST" && url.pathname === "/api/minimax/cry-analysis") return await handleCryAnalysis(request, response);
    const filePath = resolveRequestPath(request.url);
    if (!filePath) return writeJson(response, 403, { message: "Forbidden" });
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not_file");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      "Cache-Control": filePath.endsWith("sw.js") ? "no-cache" : "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    });
    response.end(body);
  } catch (error) {
    const isApi = String(request.url || "").startsWith("/api/");
    if (isApi) {
      const status = Number(error.statusCode) || (error.message === "request_too_large" ? 413 : 500);
      if (status >= 500) console.error(`[API] ${request.method} ${request.url}: ${error.message || "unknown_error"}`);
      return writeJson(response, status, { message: error.message || "服务暂时不可用" });
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not Found");
  }
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") console.error(`端口 ${port} 已被占用。CrySense 可能已经在 http://${host}:${port}/ 运行。`);
  else console.error(error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`CrySense 已启动：http://${host}:${port}/`);
  console.log(`MiniMax 服务端密钥：${miniMaxKey ? "已配置" : "待配置"}`);
  console.log(`公网域名：${configuredPublicBase || "由部署平台请求自动识别"}`);
  console.log("按 Ctrl+C 停止本地服务。");
});
