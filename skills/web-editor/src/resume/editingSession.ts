import type {
  ResumeConfig,
  ResumePolishField,
  ResumePolishProviderConfig,
} from '../types';

export type ResumeSaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed';

export interface ResumeEditingSessionSnapshot {
  resumes: ResumeConfig[];
  currentResumeId: string;
  saved: ResumeConfig | null;
  draft: ResumeConfig | null;
  saveStatus: ResumeSaveStatus;
  error: string;
}

export type ResumeDraftPatch = Partial<
  Pick<
    ResumeConfig,
    | 'name'
    | 'template'
    | 'target'
    | 'modules'
    | 'emphasize'
    | 'hide'
    | 'order'
    | 'privacy'
    | 'polish'
    | 'content_overrides'
    | 'notes'
  >
>;

export type ResumeEditingSessionCommand =
  | { type: 'change-name'; name: string }
  | { type: 'edit-draft'; patch: ResumeDraftPatch }
  | { type: 'replace-resumes'; resumes: ResumeConfig[] }
  | { type: 'prepare-destructive-change' }
  | { type: 'switch-resume'; resumeId: string; discardDirty?: boolean }
  | { type: 'create-resume'; config: ResumeConfig }
  | { type: 'delete-current-resume' }
  | {
      type: 'generate-polish';
      provider: ResumePolishProviderConfig;
      only?: { path: string; field: ResumePolishField };
      config?: ResumeConfig;
    }
  | { type: 'save' };

export type ResumeEditingSessionResult =
  | { status: 'updated' }
  | { status: 'saved' }
  | { status: 'switched' }
  | { status: 'polished'; generatedCount: number; candidateCount: number }
  | { status: 'confirm-discard'; resumeId: string }
  | { status: 'ready'; hasUnsavedDraft: boolean }
  | { status: 'failed'; error: string };

interface CreateResumeEditingSessionInput {
  resumes: ResumeConfig[];
  saveResume: (config: ResumeConfig) => Promise<void>;
  deleteResume?: (id: string) => Promise<void>;
  polishResume?: (
    config: ResumeConfig,
    provider: ResumePolishProviderConfig,
    options?: { only?: { path: string; field: ResumePolishField } },
  ) => Promise<{ config: ResumeConfig; generated_count: number; candidate_count: number }>;
}

export interface ResumeEditingSession {
  getSnapshot(): ResumeEditingSessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: ResumeEditingSessionCommand): Promise<ResumeEditingSessionResult>;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function equalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 当前简历编辑会话：集中保存版本、草稿与持久化状态。
 * React 只通过 dispatch 表达用户意图，并从 snapshot 渲染结果。
 */
export function createResumeEditingSession({
  resumes,
  saveResume,
  deleteResume,
  polishResume,
}: CreateResumeEditingSessionInput): ResumeEditingSession {
  const initial = resumes[0] ? cloneValue(resumes[0]) : null;
  let snapshot: ResumeEditingSessionSnapshot = {
    resumes: resumes.map(cloneValue),
    currentResumeId: initial?.id || '',
    saved: initial,
    draft: initial ? cloneValue(initial) : null,
    saveStatus: 'clean',
    error: '',
  };
  let draftRevision = 0;
  let saveRequested = false;
  let activeSave: Promise<ResumeEditingSessionResult> | null = null;
  const listeners = new Set<() => void>();

  const update = (changes: Partial<ResumeEditingSessionSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
  };

  const editDraft = (patch: ResumeDraftPatch) => {
    if (!snapshot.draft) return;
    draftRevision += 1;
    update({
      draft: { ...snapshot.draft, ...cloneValue(patch) },
      saveStatus: 'dirty',
      error: '',
    });
  };

  const runSaveQueue = async (): Promise<ResumeEditingSessionResult> => {
    let result: ResumeEditingSessionResult = { status: 'saved' };
    do {
      saveRequested = false;
      if (!snapshot.draft) {
        const error = '没有可保存的简历草稿';
        update({ saveStatus: 'failed', error });
        return { status: 'failed', error };
      }

      const config = cloneValue(snapshot.draft);
      const savingRevision = draftRevision;
      update({ saveStatus: 'saving', error: '' });
      try {
        await saveResume(config);
        const nextResumes = snapshot.resumes.map((resume) =>
          resume.id === config.id ? cloneValue(config) : resume,
        );
        const draftChangedWhileSaving = draftRevision !== savingRevision;
        update({
          resumes: nextResumes,
          saved: cloneValue(config),
          ...(draftChangedWhileSaving ? {} : { draft: cloneValue(config) }),
          saveStatus: draftChangedWhileSaving ? 'dirty' : 'saved',
        });
        result = { status: 'saved' };
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        update({ saveStatus: 'failed', error });
        return { status: 'failed', error };
      }
    } while (saveRequested);
    return result;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(command) {
      if (command.type === 'change-name') {
        editDraft({ name: command.name });
        return { status: 'updated' };
      }

      if (command.type === 'edit-draft') {
        editDraft(command.patch);
        return { status: 'updated' };
      }

      if (command.type === 'replace-resumes') {
        const nextResumes = command.resumes.map(cloneValue);
        update({ resumes: nextResumes });
        return { status: 'updated' };
      }

      if (command.type === 'prepare-destructive-change') {
        if (activeSave) await activeSave;
        return {
          status: 'ready',
          hasUnsavedDraft: snapshot.saveStatus === 'dirty' || snapshot.saveStatus === 'failed',
        };
      }

      if (command.type === 'switch-resume') {
        if (command.resumeId === snapshot.currentResumeId) return { status: 'switched' };
        if (activeSave) await activeSave;
        const target = snapshot.resumes.find((resume) => resume.id === command.resumeId);
        if (!target) {
          const error = `找不到简历：${command.resumeId}`;
          return { status: 'failed', error };
        }
        const hasUnsavedDraft = snapshot.saveStatus === 'dirty' || snapshot.saveStatus === 'failed';
        if (hasUnsavedDraft && !command.discardDirty) {
          return { status: 'confirm-discard', resumeId: command.resumeId };
        }
        draftRevision += 1;
        const next = cloneValue(target);
        update({
          currentResumeId: target.id,
          saved: next,
          draft: cloneValue(next),
          saveStatus: 'clean',
          error: '',
        });
        return { status: 'switched' };
      }

      if (command.type === 'create-resume') {
        if (activeSave) await activeSave;
        const config = cloneValue(command.config);
        try {
          await saveResume(config);
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : String(cause);
          return { status: 'failed', error };
        }
        draftRevision += 1;
        const nextResumes = [
          ...snapshot.resumes.filter((resume) => resume.id !== config.id),
          cloneValue(config),
        ];
        update({
          resumes: nextResumes,
          currentResumeId: config.id,
          saved: cloneValue(config),
          draft: cloneValue(config),
          saveStatus: 'clean',
          error: '',
        });
        return { status: 'switched' };
      }

      if (command.type === 'delete-current-resume') {
        if (activeSave) await activeSave;
        if (!deleteResume) return { status: 'failed', error: '未配置简历删除操作' };
        if (!snapshot.currentResumeId || snapshot.resumes.length <= 1) {
          return { status: 'failed', error: '至少保留一份简历' };
        }
        const id = snapshot.currentResumeId;
        try {
          await deleteResume(id);
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : String(cause);
          return { status: 'failed', error };
        }
        const nextResumes = snapshot.resumes.filter((resume) => resume.id !== id);
        const next = cloneValue(nextResumes[0]);
        draftRevision += 1;
        update({
          resumes: nextResumes,
          currentResumeId: next.id,
          saved: next,
          draft: cloneValue(next),
          saveStatus: 'clean',
          error: '',
        });
        return { status: 'switched' };
      }

      if (command.type === 'generate-polish') {
        if (!polishResume) return { status: 'failed', error: '未配置 AI 润色操作' };
        const polishAtRequestStart = cloneValue(snapshot.draft?.polish);
        const requestConfig = cloneValue(command.config || snapshot.draft);
        if (!requestConfig) return { status: 'failed', error: '没有可润色的简历草稿' };
        const requestResumeId = requestConfig.id;
        try {
          const result = await polishResume(
            requestConfig,
            command.provider,
            command.only ? { only: command.only } : undefined,
          );
          if (requestResumeId !== snapshot.currentResumeId) {
            return {
              status: 'polished',
              generatedCount: result.generated_count,
              candidateCount: result.candidate_count,
            };
          }
          const latestPolish = snapshot.draft?.polish;
          const polishChangedWhileGenerating = !equalValue(latestPolish, polishAtRequestStart);
          editDraft({
            polish: polishChangedWhileGenerating
              ? {
                  ...latestPolish,
                  entries: result.config.polish?.entries || latestPolish?.entries || {},
                  variants: result.config.polish?.variants || latestPolish?.variants || [],
                  selected_variant: result.config.polish?.selected_variant ?? latestPolish?.selected_variant,
                }
              : result.config.polish,
          });
          saveRequested = true;
          if (!activeSave) {
            activeSave = runSaveQueue().finally(() => {
              activeSave = null;
            });
          }
          const saved = await activeSave;
          if (saved.status === 'failed') return saved;
          return {
            status: 'polished',
            generatedCount: result.generated_count,
            candidateCount: result.candidate_count,
          };
        } catch (cause) {
          const error = cause instanceof Error ? cause.message : String(cause);
          return { status: 'failed', error };
        }
      }

      if (command.type === 'save') {
        saveRequested = true;
        if (!activeSave) {
          activeSave = runSaveQueue().finally(() => {
            activeSave = null;
          });
        }
        return activeSave;
      }

      const exhaustive: never = command;
      return { status: 'failed', error: `不支持的编辑命令：${String(exhaustive)}` };
    },
  };
}
