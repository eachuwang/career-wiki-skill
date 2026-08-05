/**
 * renderBlocks.tsx — 简历内容块渲染（纯函数 + JSX）
 *
 * 从 PreviewPanel 抽出的渲染管线：把模块 + wiki 数据 + 模板配置
 * 转成可分页的 ResumeBlock[]，供 PreviewPanel 和分页算法消费。
 * maskValue / sortEntities / getSectionFields / groupByItems 均来自
 * 后端 resume-rules.mjs，不再前端另写一份。
 */

import type { ReactNode } from 'react';
import type {
  ModuleInstance,
  WikiEntity,
  TemplateConfig,
  PrivacyConfig,
} from '../types';

import { getResumeContactItems } from './contact';
import { maskValue } from './privacy';
import {
  getSectionFields,
  sortEntities,
  groupByItems,
} from '../../../resume-generator/scripts/resume-rules.mjs';
import UiIcon from '../components/UiIcon';

/** 一个可独立分页的内容块 */
export interface ResumeBlock {
  key: string;
  node: ReactNode;
}

/** 格式化日期：present → 至今，YYYY-MM → YYYY.MM，其他原样返回 */
export function formatDate(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (s.toLowerCase() === 'present' || s === '至今') return '至今';
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}.${m[2]}` : s;
}

/** 简历头部（个人信息） */
export function ResumeHeader({
  personData,
  privacy,
  resumeName,
}: {
  personData?: WikiEntity;
  privacy: PrivacyConfig;
  resumeName: string;
}) {
  if (!personData) {
    return <h1>{resumeName}</h1>;
  }
  const f = personData.fields;
  const contacts = getResumeContactItems(f);
  return (
    <header className="person-info resume-header">
      <h1>{maskValue(f.name, 'name', privacy)}</h1>
      <div className="resume-headline">
        {maskValue(f.title, 'title', privacy)}
      </div>
      <div className="resume-contact">
        {contacts.map((contact) => (
          <span key={contact.field} className="resume-contact-item">
            <UiIcon
              name={contact.icon}
              size={13}
              className="resume-contact-icon"
            />
            {maskValue(contact.value, contact.field, privacy)}
          </span>
        ))}
      </div>
    </header>
  );
}

/** 按模板 section 把一个模块渲染成可分页的内容块列表 */
export function renderModuleBlocks(
  module: ModuleInstance,
  wikiData: WikiEntity[],
  templateSections: TemplateConfig['sections'],
  privacy: PrivacyConfig,
): ResumeBlock[] {
  const section = templateSections.find((s) => s.module === module.type);
  const title = section?.title || module.label;
  const fields = getSectionFields(section, module.type);
  if (wikiData.length === 0) return [];
  const sorted = sortEntities(wikiData, section?.order || 'desc');
  const blocks: ResumeBlock[] = [];
  const pushSection = (first: ResumeBlock, rest: ResumeBlock[]): void => {
    blocks.push(
      title
        ? {
            key: `${module.id}-head`,
            node: (
              <div className="section-head">
                <h2 className="section-title">{title}</h2>
                {first.node}
              </div>
            ),
          }
        : first,
    );
    blocks.push(...rest);
  };
  if (section?.group_by) {
    const items = groupByItems(sorted, section.group_by).map(
      ({ key: cat, items: entities }) => ({
        key: `${module.id}-group-${cat}`,
        node: (
          <div className="skill-group resume-skill-row">
            <div className="skill-group-title resume-skill-category">{cat}</div>
            <div className="skill-tags resume-skill-list">
              {entities
                .map((entity) => {
                  const name = maskValue(entity.fields.name, 'name', privacy);
                  const level = maskValue(entity.fields.level, 'level', privacy);
                  return level ? `${name}（${level}）` : name;
                })
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        ),
      }),
    );
    pushSection(items[0], items.slice(1));
    return blocks;
  }
  if (fields.length === 1) {
    const items = sorted.map((e, i) => ({
      key: `${module.id}-summary-${e.path || i}`,
      node: (
        <div className="entry resume-summary">
          {maskValue(e.fields[fields[0]], fields[0], privacy)}
        </div>
      ),
    }));
    pushSection(items[0], items.slice(1));
    return blocks;
  }
  const startIdx = fields.indexOf('start');
  const titleField = fields[0];
  const subFields =
    startIdx > 1 ? fields.slice(1, startIdx) : fields.slice(1, 3);
  const descFields = fields.filter(
    (f) =>
      f !== titleField &&
      !subFields.includes(f) &&
      f !== 'start' &&
      f !== 'end',
  );
  const items = sorted.map((e, i) => {
    const startText = formatDate(e.fields.start);
    const endText = formatDate(e.fields.end);
    const dateRange = startText ? `${startText} - ${endText || '至今'}` : endText;
    return {
      key: `${module.id}-entry-${e.path || i}`,
      node: (
        <div className="entry">
          <div className="entry-title">
            {maskValue(e.fields[titleField], titleField, privacy)}
          </div>
          <div className="entry-sub">
            <span className="entry-role">
              {subFields
                .map((f) => maskValue(e.fields[f], f, privacy))
                .filter(Boolean)
                .join(' · ')}
            </span>
            {dateRange && (
              <span className="entry-date">{dateRange}</span>
            )}
          </div>
          {descFields.map(
            (f) =>
              e.fields[f] != null && (
                <div key={f} className="entry-desc">
                  {module.type === 'project' && f === 'description' && (
                    <span className="entry-desc-label">项目描述：</span>
                  )}
                  {f === 'responsibilities' && (
                    <span className="entry-desc-label">岗位职责：</span>
                  )}
                  {f === 'tech_stack' && (
                    <span className="entry-desc-label">技术栈：</span>
                  )}
                  {maskValue(e.fields[f], f, privacy)}
                </div>
              ),
          )}
        </div>
      ),
    };
  });
  pushSection(items[0], items.slice(1));
  return blocks;
}
