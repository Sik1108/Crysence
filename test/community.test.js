import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_ART_STYLE,
  AI_JOB_STATUS,
  CommunityMemoryStorage,
  CommunityStore,
  MOMENT_VISIBILITY
} from "../src/community.js";

test("baby moments stay private unless the caregiver explicitly publishes them", () => {
  const store = new CommunityStore(new CommunityMemoryStorage());
  const initialPosts = store.listPosts().length;
  const moment = store.saveMoment({ text: "今天第一次认真看着窗边的小树。" });

  assert.equal(moment.visibility, MOMENT_VISIBILITY.PRIVATE);
  assert.equal(store.listPosts().length, initialPosts);
  assert.match(moment.medicalUsePolicy, /excluded_from_cry_classification/);

  const post = store.publishMoment(moment.id);
  assert.equal(post.sourceBabyMomentId, moment.id);
  assert.equal(store.listPosts().length, initialPosts + 1);
});

test("community filters return same-age and topic-specific posts", () => {
  const store = new CommunityStore(new CommunityMemoryStorage());
  assert.ok(store.listPosts("same-age").every(post => post.ageBand === "4-6 个月"));
  assert.ok(store.listPosts("sleep").every(post => post.topic === "sleep"));
});

test("community seed uses varied scene images instead of one repeated baby asset", () => {
  const posts = new CommunityStore(new CommunityMemoryStorage()).listPosts();
  const images = posts.map(post => post.image).filter(Boolean);

  assert.ok(images.length >= 5);
  assert.equal(new Set(images).size, images.length);
  assert.ok(posts.every(post => post.imageAlt));
});

test("MiniMax AI artwork follows an explicit queued, generating and completed lifecycle", () => {
  const store = new CommunityStore(new CommunityMemoryStorage());
  const job = store.createArtworkJob(AI_ART_STYLE.PICTURE_BOOK);

  assert.equal(job.status, AI_JOB_STATUS.QUEUED);
  assert.equal(job.provider, "minimax");
  assert.equal(job.consentMode, "explicit_single_generation");

  store.updateArtworkJob(job.id, AI_JOB_STATUS.GENERATING);
  const completed = store.updateArtworkJob(job.id, AI_JOB_STATUS.COMPLETED, { outputAssetIds: ["mock-a", "mock-b"] });
  assert.equal(completed.status, AI_JOB_STATUS.COMPLETED);
  assert.deepEqual(completed.outputAssetIds, ["mock-a", "mock-b"]);
  assert.ok(completed.completedAt);
  assert.match(completed.medicalUsePolicy, /excluded_from_cry_classification/);
});

test("community seeds use image avatars and include two live cards", () => {
  const posts = new CommunityStore(new CommunityMemoryStorage()).listPosts();
  assert.ok(posts.every(post => post.avatarImage?.startsWith("assets/")));
  assert.equal(posts.filter(post => post.live).length, 2);
  assert.ok(posts.some(post => post.live && post.commerce));
  assert.ok(posts.length >= 9);
  assert.ok(posts.some(post => post.sponsored && post.author.includes("babycare")));
});
