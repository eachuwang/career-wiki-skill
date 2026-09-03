import type {
  ResumePolishConfig,
  ResumePolishField,
  ResumePolishProviderConfig,
} from '../types';
import {
  DEFAULT_POLISH_FIELDS,
  POLISH_FIELD_OPTIONS,
  getSelectedPolishFields,
} from './polish.ts';
import type {
  ResumeEditingSession,
  ResumeEditingSessionResult,
} from './editingSession.ts';

export const POLISH_PROVIDER_STORAGE_KEY = 'career-wiki.resume-polish-provider';

export const DEFAULT_POLISH_PROVIDER: ResumePolishProviderConfig = {
  protocol: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  model: '',
  timeout_ms: 60000,
};

/** 本地配置的最小持久化接口；生产实现和测试实现可以独立替换。 */
export interface ResumePolishProviderStorage {
  load(): unknown;
  save(provider: ResumePolishProviderConfig): unknown | Promise<unknown>;
}

/** AI 模型列表查询的最小接口；润色生成仍由 editingSession 统一提交。 */
export interface ResumePolishModelClient {
  getModels(provider: ResumePolishProviderConfig): Promise<string[]>;
}

export interface ResumePolishWorkflowSnapshot {
  provider: ResumePolishProviderConfig;
  models: string[];
  modelsLoading: boolean;
  generating: boolean;
  generatingKey: string | null;
  error: string;
}

export type ResumePolishWorkflowOutcome =
  | { status: 'success'; message: string; generatedCount?: number; candidateCount?: number }
  | { status: 'needs-config'; error: string }
  | { status: 'invalid'; error: string }
  | { status: 'failed'; error: string; phase: 'save' | 'generate' | 'models' };

export interface ResumePolishWorkflow {
  getSnapshot(): ResumePolishWorkflowSnapshot;
  subscribe(listener: () => void): () => void;
  clearError(): void;
  toggle(enabled: boolean): Promise<ResumePolishWorkflowOutcome>;
  saveProvider(
    provider: ResumePolishProviderConfig,
    selectedFields: ResumePolishField[],
  ): Promise<ResumePolishWorkflowOutcome>;
  fetchModels(provider: ResumePolishProviderConfig): Promise<ResumePolishWorkflowOutcome>;
  regenerate(path: string, field: ResumePolishField): Promise<ResumePolishWorkflowOutcome>;
  regenerateAll(): Promise<ResumePolishWorkflowOutcome>;
  selectVariant(index: number): Promise<ResumePolishWorkflowOutcome>;
}

interface CreateResumePolishWorkflowInput {
  session: ResumeEditingSession;
  modelClient: ResumePolishModelClient;
  storage?: ResumePolishProviderStorage;
}

function normalizeProvider(raw: unknown): ResumePolishProviderConfig {
  const parsed = raw && typeof raw === 'object'
    ? raw as Partial<ResumePolishProviderConfig>
    : {};
  return {
    protocol: parsed.protocol === 'anthropic' ? 'anthropic' : 'openai',
    base_url: typeof parsed.base_url === 'string'
      ? parsed.base_url
      : DEFAULT_POLISH_PROVIDER.base_url,
    api_key: typeof parsed.api_key === 'string' ? parsed.api_key : '',
    ...(parsed.api_key_configured === true ? { api_key_configured: true } : {}),
    model: typeof parsed.model === 'string' ? parsed.model : '',
    timeout_ms: typeof parsed.timeout_ms === 'number'
      ? Math.min(180000, Math.max(10000, parsed.timeout_ms))
      : DEFAULT_POLISH_PROVIDER.timeout_ms,
  };
}

export function isPolishProviderConfigured(provider: ResumePolishProviderConfig): boolean {
  return Boolean(
    provider.protocol &&
      provider.base_url.trim() &&
      (provider.api_key.trim() || provider.api_key_configured === true) &&
      provider.model.trim(),
  );
}

function createMemoryPolishProviderStorage(): ResumePolishProviderStorage {
  return {
    load: () => null,
    save: (provider) => ({
      ...provider,
      api_key: '',
      api_key_configured: Boolean(provider.api_key),
    }),
  };
}

function getError(result: ResumeEditingSessionResult): string | null {
  return result.status === 'failed' ? result.error : null;
}

function createConfigWithPolish(
  config: NonNullable<ReturnType<ResumeEditingSession['getSnapshot']>['draft']>,
  polish: ResumePolishConfig,
) {
  return {
    ...structuredClone(config),
    polish,
  };
}

/**
 * AI 润色工作流：集中处理 provider、模型查询、生成状态和错误反馈。
 * 简历草稿的写入与保存仍委托给 editingSession，避免形成第二个事实源。
 */
export function createResumePolishWorkflow({
  session,
  modelClient,
  storage = createMemoryPolishProviderStorage(),
}: CreateResumePolishWorkflowInput): ResumePolishWorkflow {
  let snapshot: ResumePolishWorkflowSnapshot = {
    provider: normalizeProvider(storage.load()),
    models: [],
    modelsLoading: false,
    generating: false,
    generatingKey: null,
    error: '',
  };
  const listeners = new Set<() => void>();

  const update = (changes: Partial<ResumePolishWorkflowSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
  };

  const setError = (error: string) => {
    update({ error });
  };

  const saveDraft = async (
    patch: ResumePolishConfig,
    saveFailureMessage: string,
  ): Promise<ResumePolishWorkflowOutcome> => {
    const updated = await session.dispatch({ type: 'edit-draft', patch: { polish: patch } });
    const updateError = getError(updated);
    if (updateError) {
      setError(updateError);
      return { status: 'failed', error: updateError, phase: 'save' };
    }
    const saved = await session.dispatch({ type: 'save' });
    const saveError = getError(saved);
    if (saveError) {
      const error = `${saveFailureMessage}：${saveError}`;
      setError(error);
      return { status: 'failed', error, phase: 'save' };
    }
    return { status: 'success', message: '' };
  };

  const generate = async (
    provider: ResumePolishProviderConfig,
    only?: { path: string; field: ResumePolishField },
    config?: ReturnType<ResumeEditingSession['getSnapshot']>['draft'],
  ): Promise<ResumePolishWorkflowOutcome> => {
    update({ generating: true, generatingKey: only ? `${only.path}:${only.field}` : null });
    try {
      const result = await session.dispatch({
        type: 'generate-polish',
        provider,
        ...(only ? { only } : {}),
        ...(config ? { config } : {}),
      });
      const error = getError(result);
      if (error) {
        setError(error);
        return { status: 'failed', error, phase: 'generate' };
      }
      if (result.status !== 'polished') {
        const unexpected = 'AI 润色事务未完成';
        setError(unexpected);
        return { status: 'failed', error: unexpected, phase: 'generate' };
      }
      return {
        status: 'success',
        message: result.generatedCount > 0
          ? (only ? '已换一版润色内容' : `已生成 ${result.generatedCount} 条润色内容`)
          : (only ? '未生成新的内容，请稍后重试' : '没有可润色的项目或经历，已保留原文'),
        generatedCount: result.generatedCount,
        candidateCount: result.candidateCount,
      };
    } finally {
      update({ generating: false, generatingKey: null });
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    clearError() {
      setError('');
    },
    async toggle(enabled) {
      const draft = session.getSnapshot().draft;
      if (!draft) {
        const error = '没有可润色的简历草稿';
        setError(error);
        return { status: 'failed', error, phase: 'save' };
      }
      const polish = draft.polish;

      if (!enabled) {
        const result = await saveDraft(
          { ...(polish || {}), enabled: false },
          '保存 AI 润色设置失败',
        );
        return result.status === 'success'
          ? { ...result, message: '已关闭 AI 润色，当前显示原文' }
          : result;
      }

      const selectedFields = getSelectedPolishFields(polish);
      const cachedFields = new Set(
        Object.values(polish?.entries || {}).flatMap((entry) =>
          Object.entries(entry.fields || {})
            .filter(([, value]) => typeof value === 'string' && value.trim())
            .map(([field]) => field),
        ),
      );
      const missingCachedFields = selectedFields.filter((field) => !cachedFields.has(field));
      const hasCachedPolish = selectedFields.length > 0 && missingCachedFields.length === 0;
      if (hasCachedPolish) {
        const result = await saveDraft(
          { ...(polish || {}), enabled: true },
          '保存 AI 润色设置失败',
        );
        return result.status === 'success'
          ? { ...result, message: '已开启 AI 润色，使用已有结果' }
          : result;
      }

      if (!isPolishProviderConfigured(snapshot.provider)) {
        const missingLabels = missingCachedFields.map((field) =>
          POLISH_FIELD_OPTIONS.find((option) => option.field === field)?.label || field,
        );
        const error = cachedFields.size > 0 && missingLabels.length > 0
          ? `${missingLabels.join('、')}尚未生成，请先配置 Base URL、API Key 和模型`
          : '请先选择协议并配置 Base URL、API Key 和模型';
        setError(error);
        return { status: 'needs-config', error };
      }

      const requestConfig = createConfigWithPolish(draft, {
        ...(polish || {}),
        enabled: true,
        selected_fields: selectedFields,
      });
      return generate(snapshot.provider, undefined, requestConfig);
    },
    async saveProvider(provider, selectedFields) {
      if (selectedFields.length === 0) {
        const error = '至少选择一项润色内容';
        setError(error);
        return { status: 'invalid', error };
      }

      const nextProvider = normalizeProvider(provider);
      let storedProvider = nextProvider;
      try {
        const stored = await storage.save(nextProvider);
        if (stored) storedProvider = normalizeProvider(stored);
      } catch (cause) {
        const error = cause instanceof Error && cause.message
          ? cause.message
          : '本地 AI Provider 配置保存失败';
        setError(error);
        return { status: 'failed', error, phase: 'save' };
      }
      update({ provider: storedProvider });

      const draft = session.getSnapshot().draft;
      const nextPolish: ResumePolishConfig = {
        ...(draft?.polish || {}),
        selected_fields: selectedFields,
      };
      const result = await saveDraft(nextPolish, '保存 AI 润色设置失败');
      if (result.status !== 'success') return result;
      setError('');
      return { ...result, message: 'AI 润色模型和内容选择已保存' };
    },
    async fetchModels(provider) {
      update({ modelsLoading: true, error: '' });
      try {
        const models = await modelClient.getModels(provider);
        update({ models });
        if (models.length === 0) {
          const error = '模型列表为空，请手动填写模型名称';
          setError(error);
          return { status: 'failed', error, phase: 'models' };
        }
        return { status: 'success', message: `已拉取 ${models.length} 个模型` };
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        setError(error);
        return { status: 'failed', error, phase: 'models' };
      } finally {
        update({ modelsLoading: false });
      }
    },
    async regenerate(path, field) {
      const provider = snapshot.provider;
      if (!isPolishProviderConfigured(provider)) {
        const error = '请先选择协议并配置 Base URL、API Key 和模型';
        setError(error);
        return { status: 'needs-config', error };
      }
      const draft = session.getSnapshot().draft;
      if (!draft) {
        const error = '没有可润色的简历草稿';
        setError(error);
        return { status: 'failed', error, phase: 'generate' };
      }
      const selectedFields = getSelectedPolishFields(draft.polish);
      const requestConfig = createConfigWithPolish(draft, {
        ...(draft.polish || {}),
        enabled: true,
        selected_fields: selectedFields.length > 0 ? selectedFields : DEFAULT_POLISH_FIELDS,
      });
      return generate(provider, { path, field }, requestConfig);
    },
    async regenerateAll() {
      if (!isPolishProviderConfigured(snapshot.provider)) {
        const error = '请先选择协议并配置 Base URL、API Key 和模型';
        setError(error);
        return { status: 'needs-config', error };
      }
      const draft = session.getSnapshot().draft;
      if (!draft) {
        const error = '没有可润色的简历草稿';
        setError(error);
        return { status: 'failed', error, phase: 'generate' };
      }
      const selectedFields = getSelectedPolishFields(draft.polish);
      const requestConfig = createConfigWithPolish(draft, {
        ...(draft.polish || {}),
        enabled: true,
        selected_fields: selectedFields.length > 0 ? selectedFields : DEFAULT_POLISH_FIELDS,
      });
      return generate(snapshot.provider, undefined, requestConfig);
    },
    async selectVariant(index) {
      const draft = session.getSnapshot().draft;
      const variant = draft?.polish?.variants?.[index];
      if (!draft?.polish || !variant) {
        const error = '润色版本无效';
        setError(error);
        return { status: 'invalid', error };
      }
      const entries = Object.fromEntries(
        Object.entries(variant.entries).map(([path, entry]) => [
          path,
          { source_hash: entry.source_hash, fields: entry.fields, updated_at: new Date().toISOString() },
        ]),
      );
      const result = await saveDraft(
        { ...draft.polish, entries, selected_variant: index },
        '保存 AI 润色设置失败',
      );
      if (result.status !== 'success') return result;
      setError('');
      return { ...result, message: `已切换到版本 ${index + 1}` };
    },
  };
}
