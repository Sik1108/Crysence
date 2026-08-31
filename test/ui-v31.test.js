import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");
const css = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8");
const app = readFileSync(fileURLToPath(new URL("../app.js", import.meta.url)), "utf8");
const server = readFileSync(fileURLToPath(new URL("../scripts/serve.js", import.meta.url)), "utf8");

test("timeline owns both records and the former insights experience", () => {
  const timelineStart = html.indexOf('id="timelineView"');
  const timelineEnd = html.indexOf('id="devicesView"');
  const timelineMarkup = html.slice(timelineStart, timelineEnd);

  assert.ok(timelineStart >= 0);
  assert.ok(timelineEnd > timelineStart);
  assert.match(timelineMarkup, /id="timelineRecordPanel"/);
  assert.match(timelineMarkup, /id="timelineInsightPanel"/);
  assert.match(timelineMarkup, />洞察</);
  assert.doesNotMatch(html, /id="insightsView"/);
});

test("community uses one floating composer and keeps baby moments private-first", () => {
  assert.match(html, /data-nav="community"/);
  assert.match(html, /id="communityView"/);
  assert.match(html, /id="communityComposeButton"/);
  assert.match(html, /id="communityComposeModal"/);
  assert.match(html, /data-compose-action="note"/);
  assert.match(html, /data-compose-action="ai"/);
  assert.match(html, /name="momentVisibility" value="private" checked/);
  assert.doesNotMatch(html, /data-nav="insights"/);
});

test("home hero uses the original oversized baby artwork and five-second CTA", () => {
  assert.match(html, /class="listen-hero[^\"]*"/);
  assert.match(html, /开始 5 秒检测/);
  assert.match(html, /assets\/crysense-baby-listening\.webp/);
  assert.match(html, /class="care-glance-grid"/);
});

test("onboarding and community use distinct generated visual assets", () => {
  assert.match(html, /assets\/onboarding-listen-v2\.webp/);
  assert.match(html, /assets\/onboarding-home-v2\.webp/);
  assert.match(html, /assets\/onboarding-safety-v2\.webp/);
  assert.match(html, /class="campaign-carousel"/);
  assert.match(html, /assets\/community-feature-arched\.webp/);
  assert.doesNotMatch(html, /经验不是诊断|这里分享的是照护经验和成长瞬间/);
});

test("v4 exposes baby switching, conventional icons, search and masonry hooks", () => {
  assert.match(html, /id="babySwitchModal"/);
  assert.match(html, /data-baby-id="xinxin"/);
  assert.match(html, /assets\/baby-xinxin-card-v9\.png/);
  assert.match(html, /href="#i-bell"/);
  assert.match(html, /data-nav="community"[\s\S]*?href="#i-chat"/);
  assert.match(html, /href="#i-person"/);
  assert.match(html, /id="communitySearch"/);
  assert.match(html, /id="familyAvatarRail"/);
  assert.match(html, /\+ 邀请家人/);
});

test("v4.1 moves search to a secondary page and revises community shortcuts", () => {
  assert.match(html, /id="globalSearchButton"/);
  assert.match(html, /id="communitySearchView"/);
  assert.match(html, /id="communitySearchForm"/);
  assert.match(html, />直播广场</);
  assert.match(html, />购物车</);
  assert.match(html, />我的订单</);
  assert.match(html, />灵感中心</);
  assert.match(html, />亲子活动</);
  assert.match(html, /babycare 品牌活动/);
  assert.doesNotMatch(html, /id="timelineBabyAvatar"|id="insightBabyAvatar"/);
});

test("v4.1 keeps only note and AI studio in the floating composer", () => {
  const composeStart = html.indexOf('id="communityComposeModal"');
  const composeEnd = html.indexOf('id="momentModal"');
  const composeMarkup = html.slice(composeStart, composeEnd);
  assert.match(composeMarkup, /data-compose-action="note"/);
  assert.match(composeMarkup, /data-compose-action="ai"/);
  assert.doesNotMatch(composeMarkup, /data-compose-action="camera"|data-compose-action="album"/);
  assert.match(composeMarkup, /为 Ta 生成有趣又特别的照片/);
  assert.match(html, /assets\/baby-hehe-card-v9\.png/);
  assert.match(html, /id="i-device-crib"/);
  assert.match(html, /id="i-device-humidifier"/);
  assert.match(html, /class="baby-profile-mask"/);
});

test("direct file opening explains the module restriction and links to localhost", () => {
  assert.match(html, /id="fileLaunchHelp"/);
  assert.match(html, /window\.location\.protocol === "file:"/);
  assert.match(html, /http:\/\/127\.0\.0\.1:4174\/\?fresh=1/);
});

test("community masonry follows a compact two-column social feed rhythm", () => {
  assert.match(css, /\.community-feed\s*\{[^}]*columns:\s*2;[^}]*column-gap:\s*4px;[^}]*padding:\s*2px 2px 84px;/s);
  assert.match(css, /\.community-post-card\.is-tall \.community-post-image\s*\{\s*aspect-ratio:\s*5 \/ 6;/);
  assert.match(css, /\.community-post-card\.is-short \.community-post-image\s*\{\s*aspect-ratio:\s*4 \/ 3;/);
  assert.match(css, /-webkit-line-clamp:\s*2;/);
});

test("AI studio supports native, reference-led and custom MiniMax generation", () => {
  assert.match(html, /id="aiStyleReferenceInput"/);
  assert.match(html, /id="clearAIStyleReferenceButton"[^>]*aria-label="删除风格参考图"/);
  assert.match(html, />参考图同款</);
  assert.match(html, /data-ai-style="minimax"/);
  assert.match(html, /data-ai-style="custom"/);
  assert.match(html, /id="aiCustomPrompt"/);
  assert.match(html, /class="style-swatch sticker"><img src="assets\/ai-art-sticker\.webp"/);
  assert.match(html, /class="style-swatch comic"><img[\s\S]*?<img/);
  assert.doesNotMatch(html, /绘本小主角|data-ai-style="pictureBook"/);
  assert.match(app, /aiStyleReferenceDataUrl:\s*null/);
  assert.match(app, /state\.aiStyle !== AI_ART_STYLE\.COMIC \|\| Boolean\(state\.aiStyleReferenceDataUrl\)/);
  assert.match(app, /buildAIStyleReferenceBoard\(state\.aiSourceDataUrl, state\.aiStyleReferenceDataUrl\)/);
  assert.match(app, /function clearAIStyleReference\(\)/);
  assert.match(app, /function analyzeAIStyleReference\(image\)/);
  assert.match(app, /styleSignals:\s*referenceBoard\.styleSignals/);
  assert.match(app, /customPrompt:\s*state\.aiStyle === AI_ART_STYLE\.CUSTOM/);
  assert.match(app, /id="aiGenerationProgressBar"/);
  assert.match(server, /photorealistic Korean-style giant-head photo sticker/);
  assert.doesNotMatch(server, /pictureBook|children's picture-book character/);
  assert.match(server, /Reference image 1 is a two-panel reference board/);
  assert.match(server, /buildMeasuredStyleGuidance\(body\.styleSignals\)/);
  assert.match(server, /Treat these measured properties as hard visual constraints/);
  assert.doesNotMatch(server, /styleSource|styleReferenceDataUrl/);
  assert.match(server, /subjectReference = \[\s*\{ type: "character", image_file:[\s\S]*?\}\s*\];/);
  assert.match(server, /Closely match its framing, camera angle, subject scale, pose silhouette, spatial arrangement and background composition/);
  assert.match(server, /User creative direction/);
  assert.match(server, /prompt_optimizer:\s*config\.promptOptimizer/);
});

test("latest simplification removes demo controls and redundant result or device cards", () => {
  assert.doesNotMatch(html, /id="demoButton"|id="lowConfidenceDemoButton"|id="anomalyDemoButton"/);
  assert.doesNotMatch(html, /safety-cleared-banner|id="evidenceList"|未来适配接口|id="futureAdapterList"/);
  assert.match(html, /id="lowConfidenceRetry"/);
  assert.match(app, /classList\.toggle\("community-active", name === "community"\)/);
  assert.match(app, /正在提取声音特征/);
  assert.doesNotMatch(`${html}\n${app}`, /置信度/);
  assert.doesNotMatch(html, /id="miniMaxStatus"|暂时无法连接 MiniMax/);
});
