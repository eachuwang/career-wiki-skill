import type { ResumeConfig, ResumePolishConfig } from '../types';

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
  | {
      type: 'merge-polish-result';
      requestResumeId: string;
      polish: ResumePolishConfig | undefined;
    }
  | { type: 'replace-resumes'; resumes: ResumeConfig[] }
  | { type: 'prepare-destructive-change' }
  | { type: 'switch-resume'; resumeId: string; discardDirty?: boolean }
  | { type: 'save' };

export type ResumeEditingSessionResult =
  | { status: 'updated' }
  | { status: 'saved' }
  | { status: 'switched' }
  | { status: 'confirm-discard'; resumeId: string }
  | { status: 'ready'; hasUnsavedDraft: boolean }
  | { status: 'failed'; error: string };

interface CreateResumeEditingSessionInput {
  resumes: ResumeConfig[];
  saveResume: (config: ResumeConfig) => Promise<void>;
}

export interface ResumeEditingSession {
  getSnapshot(): ResumeEditingSessionSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: ResumeEditingSessionCommand): Promise<ResumeEditingSessionResult>;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

/**
 * 当前简历编辑会话：集中保存版本、草稿与持久化状态。
 * React 只通过 dispatch 表达用户意图，并从 snapshot 渲染结果。
 */
export function createResumeEditingSession({
  resumes,
  saveResume,
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

      if (command.type === 'merge-polish-result') {
        if (command.requestResumeId !== snapshot.currentResumeId) return { status: 'updated' };
        const latestPolish = snapshot.draft?.polish;
        editDraft({
          polish: {
            ...(command.polish || {}),
            ...latestPolish,
            entries: command.polish?.entries || latestPolish?.entries || {},
          },
        });
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

      saveRequested = true;
      if (!activeSave) {
        activeSave = runSaveQueue().finally(() => {
          activeSave = null;
        });
      }
      return activeSave;
    },
  };
}
