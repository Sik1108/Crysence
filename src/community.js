export const MOMENT_VISIBILITY = Object.freeze({
  PRIVATE: "private",
  FAMILY: "family",
  COMMUNITY: "community"
});

export const AI_ART_STYLE = Object.freeze({
  STICKER: "sticker",
  PICTURE_BOOK: "pictureBook",
  COMIC: "comic"
});

export const AI_JOB_STATUS = Object.freeze({
  QUEUED: "queued",
  GENERATING: "generating",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  DELETED: "deleted"
});

const DEFAULT_POSTS = [
  {
    id: "seed-moment-ai",
    author: "小满妈妈",
    avatar: "满",
    ageBand: "4-6 个月",
    topic: "growth",
    tags: ["成长瞬间", "AI 艺术创作"],
    text: "把今天抬头找声音的小表情，留成了一张紫色大头贴。原来平常的一秒，也会越看越喜欢。",
    aiGenerated: true,
    image: "assets/crysense-baby-listening.webp",
    createdAt: "2026-08-26T08:20:00.000Z",
    reactions: { warm: 18, same: 7 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-sleep",
    author: "豆豆爸爸",
    avatar: "豆",
    ageBand: "4-6 个月",
    topic: "sleep",
    tags: ["睡眠", "同月龄"],
    text: "这周把睡前逗弄换成轻声说话，豆豆还是会醒，但入睡前没有那么着急了。只是我们家的经验，分享给同阶段的你。",
    aiGenerated: false,
    createdAt: "2026-08-26T07:40:00.000Z",
    reactions: { warm: 26, same: 12 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-feeding",
    author: "柚子妈妈",
    avatar: "柚",
    ageBand: "3-4 个月",
    topic: "feeding",
    tags: ["喂养", "照护交接"],
    text: "夜里最有用的不是记住所有细节，而是让接手的人一眼看见上次什么时候吃过。今天终于没有互相追问啦。",
    aiGenerated: false,
    createdAt: "2026-08-25T22:18:00.000Z",
    reactions: { warm: 14, same: 9 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-growth",
    author: "一一妈妈",
    avatar: "一",
    ageBand: "4-6 个月",
    topic: "growth",
    tags: ["成长瞬间"],
    text: "今天第一次把小手伸向窗边的影子。没有完成什么大事，但我还是想把这一刻收好。",
    aiGenerated: false,
    createdAt: "2026-08-25T16:05:00.000Z",
    reactions: { warm: 31, same: 6 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeVisibility(value) {
  return Object.values(MOMENT_VISIBILITY).includes(value) ? value : MOMENT_VISIBILITY.PRIVATE;
}

export class CommunityStore {
  constructor(storage, key = "crysense-community-v1") {
    this.storage = storage;
    this.key = key;
    this.state = this.read();
  }

  read() {
    try {
      const saved = JSON.parse(this.storage?.getItem(this.key) || "null");
      if (saved && Array.isArray(saved.moments) && Array.isArray(saved.posts) && Array.isArray(saved.jobs)) return saved;
    } catch {
      // Invalid prototype data falls back to a clean local state.
    }
    return { moments: [], posts: clone(DEFAULT_POSTS), jobs: [] };
  }

  persist() {
    this.storage?.setItem(this.key, JSON.stringify(this.state));
  }

  listMoments() {
    return clone([...this.state.moments].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }

  listPosts(filter = "all") {
    return clone(this.state.posts
      .filter(post => post.moderationStatus === "published")
      .filter(post => filter === "all"
        || (filter === "same-age" && post.ageBand === "4-6 个月")
        || post.topic === filter)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }

  saveMoment({ text, visibility = MOMENT_VISIBILITY.PRIVATE, hasMockPhoto = false, linkedTimelineEventIds = [], aiArtworkId = null }) {
    const content = String(text || "").trim();
    if (!content) throw new Error("moment_text_required");
    const moment = {
      id: createId("moment"),
      babyProfileId: "baby-hehe",
      authorId: "caregiver-dad",
      createdAt: new Date().toISOString(),
      happenedAt: new Date().toISOString(),
      text: content.slice(0, 160),
      visibility: normalizeVisibility(visibility),
      hasMockPhoto: Boolean(hasMockPhoto),
      linkedTimelineEventIds: [...linkedTimelineEventIds],
      aiArtworkId,
      status: "published",
      medicalUsePolicy: "excluded_from_cry_classification_and_medical_safety_models"
    };
    this.state.moments.unshift(moment);
    this.persist();
    return clone(moment);
  }

  publishMoment(momentId) {
    const moment = this.state.moments.find(item => item.id === momentId);
    if (!moment) throw new Error("moment_not_found");
    moment.visibility = MOMENT_VISIBILITY.COMMUNITY;
    const existing = this.state.posts.find(post => post.sourceBabyMomentId === momentId);
    if (existing) return clone(existing);
    const job = moment.aiArtworkId ? this.state.jobs.find(item => item.id === moment.aiArtworkId) : null;
    const post = {
      id: createId("post"),
      sourceBabyMomentId: moment.id,
      author: "禾禾爸爸",
      avatar: "禾",
      ageBand: "4-6 个月",
      topic: "growth",
      tags: job ? ["成长瞬间", "AI 艺术创作"] : ["成长瞬间"],
      text: moment.text,
      aiGenerated: Boolean(job),
      image: job ? "assets/crysense-baby-listening.webp" : moment.hasMockPhoto ? "assets/crysense-baby-listening.webp" : null,
      createdAt: new Date().toISOString(),
      reactions: { warm: 0, same: 0 },
      liked: false,
      saved: false,
      moderationStatus: "published"
    };
    this.state.posts.unshift(post);
    this.persist();
    return clone(post);
  }

  setPostReaction(postId, kind) {
    const post = this.state.posts.find(item => item.id === postId);
    if (!post) throw new Error("post_not_found");
    if (kind === "warm") {
      post.liked = !post.liked;
      post.reactions.warm = Math.max(0, post.reactions.warm + (post.liked ? 1 : -1));
    }
    if (kind === "save") post.saved = !post.saved;
    this.persist();
    return clone(post);
  }

  createArtworkJob(style = AI_ART_STYLE.STICKER) {
    const normalizedStyle = Object.values(AI_ART_STYLE).includes(style) ? style : AI_ART_STYLE.STICKER;
    const job = {
      id: createId("art"),
      ownerId: "caregiver-dad",
      sourceAssetId: "mock-baby-source",
      style: normalizedStyle,
      status: AI_JOB_STATUS.QUEUED,
      consentMode: "mock_no_upload",
      provider: "mock",
      outputAssetIds: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      errorCode: null,
      medicalUsePolicy: "excluded_from_cry_classification_and_medical_safety_models"
    };
    this.state.jobs.unshift(job);
    this.persist();
    return clone(job);
  }

  updateArtworkJob(jobId, status, { outputAssetIds = [], errorCode = null } = {}) {
    const job = this.state.jobs.find(item => item.id === jobId);
    if (!job) throw new Error("artwork_job_not_found");
    if (!Object.values(AI_JOB_STATUS).includes(status)) throw new Error("invalid_artwork_status");
    job.status = status;
    job.outputAssetIds = [...outputAssetIds];
    job.errorCode = errorCode;
    if (status === AI_JOB_STATUS.COMPLETED) job.completedAt = new Date().toISOString();
    this.persist();
    return clone(job);
  }

  getArtworkJob(jobId) {
    return clone(this.state.jobs.find(item => item.id === jobId) || null);
  }
}

export class CommunityMemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}
