import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

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

test("community replaces the old insights tab and keeps baby moments private-first", () => {
  assert.match(html, /data-nav="community"/);
  assert.match(html, /id="communityView"/);
  assert.match(html, /id="openMomentComposer"/);
  assert.match(html, /id="openAIStudio"/);
  assert.match(html, /name="momentVisibility" value="private" checked/);
  assert.doesNotMatch(html, /data-nav="insights"/);
});

test("home hero uses the original oversized baby artwork and five-second CTA", () => {
  assert.match(html, /class="listen-hero[^\"]*"/);
  assert.match(html, /开始 5 秒检测/);
  assert.match(html, /assets\/crysense-baby-listening\.webp/);
  assert.match(html, /class="care-glance-grid"/);
});
