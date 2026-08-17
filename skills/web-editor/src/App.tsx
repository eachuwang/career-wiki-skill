/**
 * App — 主入口
 *
 * 两个页面:简历编辑器 + Wiki 图谱。
 * 共用数据层(wiki 实体、模板、简历配置)。
 * 顶栏由各页面通过 TopBar 渲染,菜单合并为单行。
 */

import { useState, useEffect, useCallback } from 'react';
import ResumeEditor from './pages/ResumeEditor';
import WikiGraph from './pages/WikiGraph';
import * as api from './api/client';
import type {
  WikiSnapshot,
  WikiEntity,
  TemplateConfig,
  ResumeConfig,
} from './types';
import UiIcon from './components/UiIcon';

type Page = 'editor' | 'graph';

export default function App() {
  const [page, setPage] = useState<Page>('editor');

  // 共享数据
  const [wiki, setWiki] = useState<WikiSnapshot | null>(null);
  const [templates, setTemplates] = useState<TemplateConfig[]>([]);
  const [resumes, setResumes] = useState<ResumeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 加载所有数据
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [wikiData, tplData, resumeData] = await Promise.all([
        api.getWiki(),
        api.getTemplates(),
        api.getResumes(),
      ]);
      setWiki(wikiData);
      setTemplates(tplData);
      setResumes(resumeData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 刷新 wiki(触发后端重新 compile)
  const handleRefreshWiki = useCallback(async () => {
    try {
      await api.refreshWiki();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [loadAll]);

  // wiki 实体扁平列表(给编辑器用)
  const wikiEntities: WikiEntity[] = wiki?.entities || [];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-ink-100">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--bg-layer-2)] text-brand-700 shadow-sm animate-pulse">
            <UiIcon name="book" size={24} />
          </div>
          <div className="text-sm text-ink-500">正在加载工作区数据...</div>
        </div>
      </div>
    );
  }

  const topBarTrailing = (
    <>
      {error && (
        <div className="app-error" role="alert">
          {error}
          <button
            onClick={loadAll}
            className="ml-2 underline hover:text-[var(--text-primary)]"
          >
            重试
          </button>
        </div>
      )}
      <button
        type="button"
        className="toolbar-icon-button"
        onClick={handleRefreshWiki}
        title="重新编译 Wiki"
        aria-label="重新编译 Wiki"
      >
        <UiIcon name="refresh" size={16} />
      </button>
    </>
  );

  return (
    <div className="h-full flex flex-col bg-ink-100">
      {/* 页面内容:顶栏由各页面渲染(TopBar) */}
      <div className="flex-1 overflow-hidden">
        {page === 'editor' ? (
          <ResumeEditor
            wikiEntities={wikiEntities}
            templates={templates}
            resumes={resumes}
            page={page}
            onNavigate={setPage}
            trailing={topBarTrailing}
          />
        ) : (
          <WikiGraph
            wiki={wiki}
            resumes={resumes}
            onRefreshWiki={handleRefreshWiki}
            page={page}
            onNavigate={setPage}
            trailing={topBarTrailing}
          />
        )}
      </div>
    </div>
  );
}
