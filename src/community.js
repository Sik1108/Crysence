export const MOMENT_VISIBILITY = Object.freeze({
  PRIVATE: "private",
  FAMILY: "family",
  COMMUNITY: "community"
});

export const AI_ART_STYLE = Object.freeze({
  STICKER: "sticker",
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
    avatarImage: "assets/community-avatar-cat.webp",
    ageBand: "4-6 个月",
    topic: "growth",
    tags: ["成长瞬间", "AI 艺术创作"],
    text: "把今天抬头找声音的小表情，留成了一张紫色大头贴。原来平常的一秒，也会越看越喜欢。",
    aiGenerated: true,
    image: "assets/ai-art-sticker.webp",
    imageAlt: "AI 艺术化宝宝大头贴",
    imageAspect: "short",
    live: false,
    createdAt: "2026-08-26T08:20:00.000Z",
    reactions: { warm: 18, same: 7 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-sleep",
    author: "豆豆爸爸",
    avatarImage: "assets/community-avatar-kid.webp",
    ageBand: "4-6 个月",
    topic: "sleep",
    tags: ["睡眠", "同月龄"],
    text: "这周把睡前逗弄换成轻声说话，豆豆还是会醒，但入睡前没有那么着急了。夜里这样安静看着他，也觉得时间慢了下来。",
    aiGenerated: false,
    image: "assets/community-safe-sleep.webp",
    imageAlt: "宝宝在空婴儿床里安全仰睡，妈妈在床边陪伴",
    imageAspect: "tall",
    live: true,
    createdAt: "2026-08-26T07:40:00.000Z",
    reactions: { warm: 26, same: 12 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-feeding",
    author: "柚子妈妈",
    avatarImage: "assets/community-avatar-dog.webp",
    ageBand: "3-4 个月",
    topic: "feeding",
    tags: ["喂养", "照护交接"],
    text: "夜里最有用的不是记住所有细节，而是让接手的人一眼看见上次什么时候吃过。今天终于没有互相追问啦。",
    aiGenerated: false,
    image: "assets/community-feeding.webp",
    imageAlt: "爸爸在暖灯旁抱着宝宝喂奶",
    imageAspect: "short",
    live: false,
    createdAt: "2026-08-25T22:18:00.000Z",
    reactions: { warm: 14, same: 9 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-growth",
    author: "一一妈妈",
    avatarImage: "assets/baby-hehe-profile.webp",
    ageBand: "4-6 个月",
    topic: "growth",
    tags: ["成长瞬间"],
    text: "今天第一次把小手伸向窗边的影子。没有完成什么大事，但我还是想把这一刻收好。",
    aiGenerated: false,
    image: "assets/community-leaf-shadows.webp",
    imageAlt: "宝宝在爸爸妈妈陪伴下触碰墙上的树影",
    imageAspect: "tall",
    live: false,
    createdAt: "2026-08-25T16:05:00.000Z",
    reactions: { warm: 31, same: 6 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-play",
    author: "米粒妈妈",
    avatarImage: "assets/baby-xinxin-profile.webp",
    ageBand: "4-6 个月",
    topic: "growth",
    tags: ["成长瞬间", "亲子时光"],
    text: "趴趴练习的时候，米粒忽然抬头看了我好久。我们都没说话，却像认真聊了一小会儿。",
    aiGenerated: false,
    image: "assets/community-tummy-time.webp",
    imageAlt: "妈妈陪宝宝在软垫上练习趴卧",
    imageAspect: "short",
    live: false,
    createdAt: "2026-08-25T12:46:00.000Z",
    reactions: { warm: 22, same: 11 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-live-product",
    author: "小芽选物",
    avatarImage: "assets/community-feature-arched.webp",
    ageBand: "母婴好物直播",
    topic: "growth",
    tags: ["直播中", "母婴好物"],
    text: "轻薄睡袋怎么选？今晚一起看面料、尺码和不同室温下的穿法。",
    aiGenerated: false,
    image: "assets/community-live-product.webp",
    imageAlt: "妈妈在直播中展示薰衣草色婴儿睡袋",
    imageAspect: "tall",
    live: true,
    commerce: true,
    createdAt: "2026-08-26T09:02:00.000Z",
    reactions: { warm: 38, same: 15 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-babycare-sponsored",
    author: "babycare 官方",
    avatarImage: "assets/babycare-campaign-v1.webp",
    ageBand: "品牌合作",
    topic: "sleep",
    tags: ["babycare", "婴儿睡袋", "品牌合作"],
    text: "轻薄睡袋体验季：按卧室温度选择合适厚度，让翻身和抬腿都更自在。",
    aiGenerated: false,
    sponsored: true,
    image: "assets/babycare-campaign-v1.webp",
    imageAlt: "妈妈为宝宝穿上淡紫色婴儿睡袋",
    imageAspect: "tall",
    live: false,
    createdAt: "2026-08-27T08:42:00.000Z",
    reactions: { warm: 46, same: 18 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-dad-bedtime",
    author: "晨晨爸爸",
    avatarImage: "assets/family-dad.webp",
    ageBand: "7-9 个月",
    topic: "sleep",
    tags: ["睡前仪式", "爸爸带娃"],
    text: "最近把睡前流程缩短成洗澡、关大灯和一首固定的小曲，晨晨听到前奏就知道要休息了。",
    aiGenerated: false,
    image: "assets/onboarding-home-v2.webp",
    imageAlt: "爸爸在婴儿床旁陪宝宝准备入睡",
    imageAspect: "short",
    live: false,
    createdAt: "2026-08-27T07:25:00.000Z",
    reactions: { warm: 19, same: 8 },
    liked: false,
    saved: false,
    moderationStatus: "published"
  },
  {
    id: "seed-family-listening",
    author: "安安妈妈",
    avatarImage: "assets/family-mom.webp",
    ageBand: "3-4 个月",
    topic: "growth",
    tags: ["亲子互动", "回应宝宝"],
    text: "安安今天会停下来听我说话，再用咿呀声回应。短短几秒，像我们第一次认真聊天。",
    aiGenerated: false,
    image: "assets/onboarding-listen-v2.webp",
    imageAlt: "妈妈抱着宝宝温柔交流",
    imageAspect: "tall",
    live: false,
    createdAt: "2026-08-26T18:36:00.000Z",
    reactions: { warm: 27, same: 10 },
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
  constructor(storage, key = "crysense-community-v5") {
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

  saveMoment({ text, visibility = MOMENT_VISIBILITY.PRIVATE, hasMockPhoto = false, linkedTimelineEventIds = [], aiArtworkId = null, babyProfileId = "baby-hehe", generatedImage = null }) {
    const content = String(text || "").trim();
    if (!content) throw new Error("moment_text_required");
    const moment = {
      id: createId("moment"),
      babyProfileId,
      authorId: "caregiver-dad",
      createdAt: new Date().toISOString(),
      happenedAt: new Date().toISOString(),
      text: content.slice(0, 160),
      visibility: normalizeVisibility(visibility),
      hasMockPhoto: Boolean(hasMockPhoto),
      linkedTimelineEventIds: [...linkedTimelineEventIds],
      aiArtworkId,
      generatedImage,
      status: "published",
      medicalUsePolicy: "excluded_from_cry_classification_and_medical_safety_models"
    };
    this.state.moments.unshift(moment);
    this.persist();
    return clone(moment);
  }

  publishMoment(momentId, authorProfile = {}) {
    const moment = this.state.moments.find(item => item.id === momentId);
    if (!moment) throw new Error("moment_not_found");
    moment.visibility = MOMENT_VISIBILITY.COMMUNITY;
    const existing = this.state.posts.find(post => post.sourceBabyMomentId === momentId);
    if (existing) return clone(existing);
    const job = moment.aiArtworkId ? this.state.jobs.find(item => item.id === moment.aiArtworkId) : null;
    const post = {
      id: createId("post"),
      sourceBabyMomentId: moment.id,
      author: authorProfile.author || "禾禾爸爸",
      avatarImage: authorProfile.avatarImage || "assets/baby-hehe-profile.webp",
      ageBand: authorProfile.ageBand || "4-6 个月",
      topic: "growth",
      tags: job ? ["成长瞬间", "AI 艺术创作"] : ["成长瞬间"],
      text: moment.text,
      aiGenerated: Boolean(job),
      image: moment.generatedImage || (job
        ? "assets/ai-art-sticker.webp"
        : moment.hasMockPhoto ? "assets/community-feature-arched.webp" : null),
      imageAlt: job ? "AI 艺术化宝宝小作品" : moment.hasMockPhoto ? "宝宝成长小记的演示场景图" : null,
      createdAt: new Date().toISOString(),
      imageAspect: "short",
      live: false,
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

  createArtworkJob(style = AI_ART_STYLE.STICKER, { provider = "minimax", sourceAssetId = "uploaded-photo" } = {}) {
    const normalizedStyle = Object.values(AI_ART_STYLE).includes(style) ? style : AI_ART_STYLE.STICKER;
    const job = {
      id: createId("art"),
      ownerId: "caregiver-dad",
      sourceAssetId,
      style: normalizedStyle,
      status: AI_JOB_STATUS.QUEUED,
      consentMode: provider === "minimax" ? "explicit_single_generation" : "mock_no_upload",
      provider,
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
