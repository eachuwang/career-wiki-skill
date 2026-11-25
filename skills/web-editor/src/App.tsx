import { useEffect, useState, useSyncExternalStore } from 'react';
import ResumeEditor from './pages/ResumeEditor';
import WikiGraph from './pages/WikiGraph';
import * as api from './api/client';
import { createResumeEditingWorkspace } from './resume/editingWorkspace';
import { POLISH_PROVIDER_STORAGE_KEY } from './resume/polishWorkflow';
import type { ResumeConfig, ResumePolishProviderConfig, TemplateConfig, WikiSnapshot } from './types';
import type { TopBarPage } from './components/TopBar';

const LAST_RESUME_KEY = 'career-wiki.selected-resume';
type UnsavedChoice = 'save' | 'discard' | 'stay';
interface EditorInputs {
  wiki: WikiSnapshot;
  resumes: ResumeConfig[];
  templates: TemplateConfig[];
  provider: ResumePolishProviderConfig | null;
}

export default function App() {
  const [inputs, setInputs] = useState<EditorInputs | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    setError('');
    try {
      const [wiki, resumes, templates, provider] = await Promise.all([
        api.getWiki(), api.getResumes(), api.getTemplates(), api.getPolishProvider().catch(() => null),
      ]);
      setInputs({ wiki, resumes, templates, provider });
    } catch (cause) {
      setError(String(cause));
    }
  };
  useEffect(() => { void load(); }, []);

  if (!inputs) return (
    <main className="workspace-empty">
      {error ? <><p role="alert">{error}</p><button type="button" className="toolbar-button" onClick={load}>重试</button></>
        : <p role="status">正在加载工作区…</p>}
    </main>
  );
  return <WorkspaceApp inputs={inputs} />;
}

function WorkspaceApp({ inputs }: { inputs: EditorInputs }) {
  const [page, setPage] = useState<TopBarPage>('editor');
  const [wiki, setWiki] = useState(inputs.wiki);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [choice, setChoice] = useState<{ message: string; resolve: (choice: UnsavedChoice) => void } | null>(null);
  const [workspace] = useState(() => createResumeEditingWorkspace({
    ...inputs,
    wikiEntities: inputs.wiki.entities,
    selectedResumeId: window.localStorage.getItem(LAST_RESUME_KEY) ?? undefined,
    saveResume: api.saveResume,
    deleteResume: api.deleteResume,
    polishResume: api.polishResume,
    modelClient: { getModels: api.getPolishModels },
    polishProviderStorage: { load: () => inputs.provider, save: api.savePolishProvider },
    templateRepository: { list: api.getTemplates, save: api.saveTemplate, delete: api.deleteTemplate },
    confirmation: {
      confirm: (message) => window.confirm(message),
      resolveUnsaved: (message) => new Promise((resolve) => setChoice({ message, resolve })),
    },
  }));
  const state = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);
  const savedId = state.resumes.some((resume) => resume.id === state.currentResumeId) ? state.currentResumeId : '';
  useEffect(() => { window.localStorage.removeItem(POLISH_PROVIDER_STORAGE_KEY); }, []);
  useEffect(() => {
    if (savedId) window.localStorage.setItem(LAST_RESUME_KEY, savedId);
  }, [savedId]);
  useEffect(() => {
    if (state.saveStatus !== 'dirty' && state.saveStatus !== 'failed' && state.saveStatus !== 'saving') return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [state.saveStatus]);

  const refresh = async (requestCompile = false) => {
    setRefreshing(true);
    try {
      const guidance = requestCompile ? await api.refreshWiki() : null;
      const next = await api.getWiki();
      await workspace.dispatch({ type: 'replace-inputs', wikiEntities: next.entities });
      setWiki(next);
      setNotice({ message: guidance?.status === 'needs_agent' ? guidance.message || '请交给 Agent 编译 Wiki。' : '已刷新 Wiki 数据' });
    } catch (cause) {
      setNotice({ message: String(cause), error: true });
    } finally {
      setRefreshing(false);
    }
  };
  const navigate = (next: TopBarPage) => {
    if (next !== page) void workspace.dispatch({ type: 'close-overlay' });
    setPage(next);
  };
  const finishChoice = (answer: UnsavedChoice) => {
    choice?.resolve(answer);
    setChoice(null);
  };
  const trailing = <button type="button" className="toolbar-button ghost" onClick={() => void refresh()} disabled={refreshing}>刷新 Wiki</button>;

  return (
    <div className="h-full flex flex-col">
      {notice && (
        <div className="workspace-notice" role={notice.error ? 'alert' : 'status'}>
          {notice.message} <button type="button" onClick={() => setNotice(null)}>关闭</button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">
        {page === 'editor'
          ? <ResumeEditor workspace={workspace} state={state} wikiEmpty={!wiki.entities.length} page={page} onNavigate={navigate} trailing={trailing} onCompile={() => void refresh(true)} />
          : <WikiGraph wiki={wiki} resumes={state.resumes} onRefreshWiki={() => void refresh()} page={page} onNavigate={navigate} trailing={trailing} />}
      </div>
      {choice && (
        <dialog ref={(element) => { if (element && !element.open) element.showModal(); }} className="workspace-choice" onCancel={(event) => { event.preventDefault(); finishChoice('stay'); }} aria-label="未保存修改">
          <h2>{choice.message}</h2>
          <div className="workspace-choice-actions">
            <button type="button" autoFocus className="toolbar-button" onClick={() => finishChoice('stay')}>留在原处</button>
            <button type="button" className="toolbar-button" onClick={() => finishChoice('discard')}>放弃修改</button>
            <button type="button" className="toolbar-button strong" onClick={() => finishChoice('save')}>保存并继续</button>
          </div>
        </dialog>
      )}
    </div>
  );
}
