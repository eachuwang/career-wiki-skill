/**
 * TopBar — 单行顶栏
 *
 * 品牌 + 页面切换 + 页面工具区(children)+ 右侧全局操作(trailing)。
 * 所有菜单与操作合并进这一栏,内容区不再有第二条工具条。
 */

import type { ReactNode } from 'react';
import UiIcon from './UiIcon';

export type TopBarPage = 'editor' | 'graph';

interface TopBarProps {
  page: TopBarPage;
  onNavigate: (page: TopBarPage) => void;
  children?: ReactNode;
  trailing?: ReactNode;
}

export default function TopBar({ page, onNavigate, children, trailing }: TopBarProps) {
  return (
    <header className="app-nav no-print" aria-label="顶栏">
      <span className="app-brand">
        <UiIcon name="book" size={18} /> Career Wiki
      </span>
      <div className="app-nav-tabs" role="tablist" aria-label="工作区">
        <button
          onClick={() => onNavigate('editor')}
          role="tab"
          aria-selected={page === 'editor'}
          className={`app-nav-tab ${page === 'editor' ? 'active' : ''}`}
        >
          简历
        </button>
        <button
          onClick={() => onNavigate('graph')}
          role="tab"
          aria-selected={page === 'graph'}
          className={`app-nav-tab ${page === 'graph' ? 'active' : ''}`}
        >
          图谱
        </button>
      </div>
      {children && <div className="topbar-tools">{children}</div>}
      {trailing && <div className="app-nav-actions">{trailing}</div>}
    </header>
  );
}
