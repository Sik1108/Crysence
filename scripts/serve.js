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

const stylePrompts = {
  sticker: "保留宝宝本人清晰可辨的五官、年龄和姿态，制作高级儿童摄影大头贴。柔和鼠尾草绿纯色背景，自然肤色，真实摄影质感，干净构图，不添加文字，不改变身份。",
  pictureBook: "保留宝宝本人清晰可辨的五官、年龄和姿态，转化为精致温柔的儿童绘本主角。细腻蜡笔与水彩纸纹理，低饱和鼠尾草绿和奶油色，不添加文字。",
  comic: "保留宝宝本人清晰可辨的五官、年龄和姿态，转化为一格温柔家庭漫画。自然光，细腻线稿，低饱和配色，真实比例，不添加文字或对话框。"
};

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

async function handleImageGeneration(request, response) {
  const publicBase = resolvePublicBase(request);
  if (!miniMaxKey || !isPublicHttpBase(publicBase)) {
    return writeJson(response, 503, { configured: false, message: "MiniMax 尚未配置：需要服务端 MINIMAX_API_KEY 和 HTTPS 公网域名。" });
  }
  const body = await readJson(request);
  if (body.consent !== true) return writeJson(response, 400, { message: "需要明确同意本次照片上传生成。" });
  const match = String(body.imageDataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return writeJson(response, 400, { message: "照片格式无效，请使用 JPG、PNG 或 WebP。" });
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) return writeJson(response, 413, { message: "照片需小于 8 MB。" });

  const extension = match[1].endsWith("png") ? "png" : match[1].endsWith("webp") ? "webp" : "jpg";
  const sourceName = `${randomUUID()}.${extension}`;
  const sourceDir = path.join(runtimeRoot, "uploads");
  await mkdir(sourceDir, { recursive: true });
  const sourcePath = path.join(sourceDir, sourceName);
  await writeFile(sourcePath, buffer);
  const sourceUrl = `${publicBase}/runtime/uploads/${sourceName}`;
  const style = stylePrompts[body.style] ? body.style : "sticker";
  let payload;
  try {
    payload = await miniMaxRequest("/image_generation", {
      model: "image-01",
      prompt: `${stylePrompts[style]} 主体是名叫${String(body.babyName || "宝宝").slice(0, 12)}的婴儿。`,
      subject_reference: [{ type: "character", image_file: sourceUrl }],
      aspect_ratio: "3:4",
      response_format: "base64",
      n: 1,
      prompt_optimizer: true
    });
  } finally {
    await unlink(sourcePath).catch(() => {});
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
    if (isApi) return writeJson(response, error.message === "request_too_large" ? 413 : 500, { message: error.message || "服务暂时不可用" });
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
