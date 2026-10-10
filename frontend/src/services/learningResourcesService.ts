import { db } from '../db';

export interface LearningResource {
  id: string;
  label: string;
  url: string;
  targetType?: 'topic' | 'question';
  targetKey?: string;
}

export interface LearningResourcesData {
  topics: Record<string, LearningResource[]>;
  questions: Record<string, LearningResource[]>;
}

let memoryCache: LearningResourcesData | null = null;

const STORAGE_KEY = 'slackr_learning_resources_cache';

export class LearningResourcesService {
  /**
   * Load all learning resources from API / static JSON / local cache.
   */
  static async loadAll(): Promise<LearningResourcesData> {
    if (memoryCache) {
      return memoryCache;
    }

    let loaded: LearningResourcesData = { topics: {}, questions: {} };

    // 1. Try local storage / Dexie first for any latest edits
    try {
      const cachedStr = localStorage.getItem(STORAGE_KEY);
      if (cachedStr) {
        loaded = JSON.parse(cachedStr);
      }
    } catch (e) {
      // ignore
    }

    // 2. Fetch from API or static JSON bundle
    try {
      const res = await fetch('/api/learning-resources');
      if (res.ok) {
        const remoteData: LearningResourcesData = await res.json();
        loaded = this.mergeData(remoteData, loaded);
      } else {
        const staticRes = await fetch('/data/learning_resources.json');
        if (staticRes.ok) {
          const staticData: LearningResourcesData = await staticRes.json();
          loaded = this.mergeData(staticData, loaded);
        }
      }
    } catch (e) {
      try {
        const staticRes = await fetch('/data/learning_resources.json');
        if (staticRes.ok) {
          const staticData: LearningResourcesData = await staticRes.json();
          loaded = this.mergeData(staticData, loaded);
        }
      } catch (err) {
        // use local
      }
    }

    memoryCache = loaded;
    this.saveToLocalCache(loaded);
    return loaded;
  }

  private static mergeData(
    base: LearningResourcesData,
    overrides: LearningResourcesData
  ): LearningResourcesData {
    const result: LearningResourcesData = {
      topics: { ...base.topics },
      questions: { ...base.questions },
    };

    if (overrides.topics) {
      for (const [t, list] of Object.entries(overrides.topics)) {
        if (!result.topics[t]) {
          result.topics[t] = list;
        } else {
          // Merge unique by ID or URL
          const existingMap = new Map(result.topics[t].map((item) => [item.id, item]));
          for (const item of list) {
            existingMap.set(item.id, item);
          }
          result.topics[t] = Array.from(existingMap.values());
        }
      }
    }

    if (overrides.questions) {
      for (const [q, list] of Object.entries(overrides.questions)) {
        if (!result.questions[q]) {
          result.questions[q] = list;
        } else {
          const existingMap = new Map(result.questions[q].map((item) => [item.id, item]));
          for (const item of list) {
            existingMap.set(item.id, item);
          }
          result.questions[q] = Array.from(existingMap.values());
        }
      }
    }

    return result;
  }

  private static saveToLocalCache(data: LearningResourcesData) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      db.settings.put({ key: 'learning_resources', value: data }).catch(() => {});
    } catch (e) {
      // ignore
    }
  }

  /**
   * Get all relevant resources for a question (combines question-specific and topic resources).
   */
  static async getResources(
    questionId?: string,
    topics: string[] = []
  ): Promise<LearningResource[]> {
    const data = await this.loadAll();
    const result: LearningResource[] = [];
    const seenIds = new Set<string>();

    // 1. Question-specific links first
    if (questionId && data.questions && data.questions[questionId]) {
      for (const item of data.questions[questionId]) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          result.push({ ...item, targetType: 'question', targetKey: questionId });
        }
      }
    }

    // 2. Topic links
    for (const topic of topics) {
      const topicKey = topic.toLowerCase();
      if (data.topics && data.topics[topicKey]) {
        for (const item of data.topics[topicKey]) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            result.push({ ...item, targetType: 'topic', targetKey: topicKey });
          }
        }
      }
    }

    return result;
  }

  /**
   * Add a new learning resource link and persist to JSON.
   */
  static async addResource(params: {
    label: string;
    url: string;
    targetType: 'topic' | 'question';
    targetKey: string;
  }): Promise<LearningResource> {
    const data = await this.loadAll();
    const newId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newResource: LearningResource = {
      id: newId,
      label: params.label.trim(),
      url: params.url.trim(),
      targetType: params.targetType,
      targetKey: params.targetKey,
    };

    if (params.targetType === 'question') {
      if (!data.questions) data.questions = {};
      if (!data.questions[params.targetKey]) data.questions[params.targetKey] = [];
      data.questions[params.targetKey].push(newResource);
    } else {
      const key = params.targetKey.toLowerCase();
      if (!data.topics) data.topics = {};
      if (!data.topics[key]) data.topics[key] = [];
      data.topics[key].push(newResource);
    }

    memoryCache = data;
    this.saveToLocalCache(data);
    await this.persistToJson(data);

    return newResource;
  }

  /**
   * Update an existing learning resource link and persist to JSON.
   */
  static async updateResource(
    resourceId: string,
    updated: { label: string; url: string }
  ): Promise<boolean> {
    const data = await this.loadAll();
    let found = false;

    // Search in questions
    if (data.questions) {
      for (const qKey of Object.keys(data.questions)) {
        const idx = data.questions[qKey].findIndex((r) => r.id === resourceId);
        if (idx !== -1) {
          data.questions[qKey][idx] = {
            ...data.questions[qKey][idx],
            label: updated.label.trim(),
            url: updated.url.trim(),
          };
          found = true;
          break;
        }
      }
    }

    // Search in topics
    if (!found && data.topics) {
      for (const tKey of Object.keys(data.topics)) {
        const idx = data.topics[tKey].findIndex((r) => r.id === resourceId);
        if (idx !== -1) {
          data.topics[tKey][idx] = {
            ...data.topics[tKey][idx],
            label: updated.label.trim(),
            url: updated.url.trim(),
          };
          found = true;
          break;
        }
      }
    }

    if (found) {
      memoryCache = data;
      this.saveToLocalCache(data);
      await this.persistToJson(data);
    }

    return found;
  }

  /**
   * Delete a learning resource and persist to JSON.
   */
  static async deleteResource(resourceId: string): Promise<boolean> {
    const data = await this.loadAll();
    let found = false;

    if (data.questions) {
      for (const qKey of Object.keys(data.questions)) {
        const initialLen = data.questions[qKey].length;
        data.questions[qKey] = data.questions[qKey].filter((r) => r.id !== resourceId);
        if (data.questions[qKey].length !== initialLen) {
          found = true;
          break;
        }
      }
    }

    if (!found && data.topics) {
      for (const tKey of Object.keys(data.topics)) {
        const initialLen = data.topics[tKey].length;
        data.topics[tKey] = data.topics[tKey].filter((r) => r.id !== resourceId);
        if (data.topics[tKey].length !== initialLen) {
          found = true;
          break;
        }
      }
    }

    if (found) {
      memoryCache = data;
      this.saveToLocalCache(data);
      await this.persistToJson(data);
    }

    return found;
  }

  /**
   * Persist full data structure to backend / public JSON file.
   */
  private static async persistToJson(data: LearningResourcesData): Promise<void> {
    try {
      await fetch('/api/learning-resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.warn('Could not post learning resources to API, saved to offline cache:', e);
    }
  }
}
