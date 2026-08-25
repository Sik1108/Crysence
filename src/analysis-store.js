const STORAGE_KEY = "crysense-analyses-v3";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class MemoryStorage {
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

export class AnalysisStore {
  constructor(storage = globalThis.localStorage, storageKey = STORAGE_KEY) {
    this.storage = storage;
    this.storageKey = storageKey;
  }

  list() {
    try {
      return JSON.parse(this.storage.getItem(this.storageKey) || "[]");
    } catch {
      return [];
    }
  }

  get(id) {
    return this.list().find(record => record.id === id) || null;
  }

  save(analysis) {
    const record = {
      id: analysis.id,
      timestamp: analysis.timestamp || new Date().toISOString(),
      cryReason: analysis.cryReason,
      probabilityDistribution: clone(analysis.probabilityDistribution || {}),
      confidence: analysis.confidence,
      safetyResult: clone(analysis.safetyResult),
      recommendedActions: clone(analysis.recommendedActions || []),
      userConsent: null,
      executedActions: [],
      executionResult: null,
      userFeedback: null,
      interventionEffective: null,
      medicalUsePolicy: "Smart-home behavior is excluded from medical diagnosis inputs."
    };
    const records = this.list().filter(item => item.id !== record.id);
    records.unshift(record);
    this.storage.setItem(this.storageKey, JSON.stringify(records));
    return clone(record);
  }

  update(id, changes) {
    const records = this.list();
    const index = records.findIndex(record => record.id === id);
    if (index < 0) return null;
    records[index] = { ...records[index], ...clone(changes) };
    this.storage.setItem(this.storageKey, JSON.stringify(records));
    return clone(records[index]);
  }

  recordConsent(id, consent) {
    return this.update(id, { userConsent: consent });
  }

  recordExecution(id, result) {
    return this.update(id, {
      executedActions: result.results.filter(item => item.status === "completed").map(item => item.actionId),
      executionResult: result
    });
  }

  recordFeedback(id, { userFeedback, interventionEffective }) {
    return this.update(id, { userFeedback, interventionEffective });
  }
}
