import { LocalJsonStore } from './localJsonStore';

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

const store = new LocalJsonStore<LearningResourcesData>({
  storageKey: 'slackr_learning_resources_cache',
  apiUrl: '/api/learning-resources',
  staticUrl: '/data/learning_resources.json',
  empty: () => ({ topics: {}, questions: {} }),
});

const normalize = (d: Partial<LearningResourcesData> | null | undefined): LearningResourcesData => ({
  topics: d?.topics && typeof d.topics === 'object' ? d.topics : {},
  questions: d?.questions && typeof d.questions === 'object' ? d.questions : {},
});

export class LearningResourcesService {
  /** True when the last save reached the project JSON file; false = saved on this device only. */
  static get lastSavedRemotely(): boolean {
    return store.lastSavedRemotely;
  }

  /**
   * Load all learning resources (local-first, works offline).
   */
  static async loadAll(): Promise<LearningResourcesData> {
    if (memoryCache) {
      return memoryCache;
    }
    memoryCache = normalize(await store.load());
    return memoryCache;
  }

  static isLearningResourcesShape(json: any): boolean {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return false;
    if (!json.topics || typeof json.topics !== 'object') return false;
    const sample = [...Object.values(json.topics), ...Object.values(json.questions || {})][0];
    return sample === undefined || Array.isArray(sample);
  }

  /** Import a learning_resources.json (or the block inside a full backup). Works offline. */
  static async importData(
    incoming: Partial<LearningResourcesData>,
    strategy: 'merge' | 'replace'
  ): Promise<{ count: number; savedRemotely: boolean }> {
    const clean = normalize(incoming);
    const next = strategy === 'replace' ? clean : this.mergeData(await this.loadAll(), clean);
    memoryCache = next;
    const savedRemotely = await store.save(next);
    const count = [...Object.values(clean.topics), ...Object.values(clean.questions)].reduce(
      (n, list) => n + (Array.isArray(list) ? list.length : 0),
      0
    );
    return { count, savedRemotely };
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
    await store.save(data);

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
      await store.save(data);
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
      await store.save(data);
    }

    return found;
  }
}
