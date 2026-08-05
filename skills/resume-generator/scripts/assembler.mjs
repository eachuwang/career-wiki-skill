/**
 * assembler.mjs — 简历组装核心（纯函数，可直测）
 *
 * 读 wiki markdown → 按 template.sections + config 组装结构化简历 JSON。
 * 渲染规则（脱敏/排序/字段选择/隐藏/分组）消费 resume-rules.mjs，
 * wiki 解析复用 wiki-engine/scripts/wiki-parser.mjs，本模块只做编排。
 *
 * 不含 HTTP / 文件 CRUD —— 可脱离 server 直接 import 测试。
 */

import { join } from 'node:path';
import { collectMarkdown, parseWikiFile } from '../../wiki-engine/scripts/wiki-parser.mjs';
import {
  sortEntities,
  getSectionFields,
  applyHide,
  groupByItems,
  DEFAULT_PRIVACY,
  maskItemFields,
} from './resume-rules.mjs';
import { ENTITY_DIRS, extractResponsibilities } from './wiki-reader.mjs';

/**
 * 数据组装核心函数
 * @param {object} config — 简历配置
 * @param {object} template — 模板配置 JSON
 * @param {string} wikiRoot — wiki 根路径
 * @returns {object} 结构化简历 JSON
 */
export async function assembleResume(config, template, wikiRoot) {
  const wikiPath = join(wikiRoot, 'wiki');
  const sections = [];

  // 简历配置的 modules 覆盖模板 sections 顺序
  let orderedSections;
  if (Array.isArray(config.modules) && config.modules.length > 0) {
    // 按配置的 modules 顺序过滤模板 sections
    orderedSections = config.modules
      .map((mod) => template.sections.find((s) => s.module === mod))
      .filter(Boolean);
  } else {
    orderedSections = template.sections || [];
  }

  for (const section of orderedSections) {
    const module = section.module;
    const dirName = ENTITY_DIRS[module];
    if (!dirName) continue; // 未知 module，跳过

    const entityDir = join(wikiPath, dirName);
    const mdFiles = await collectMarkdown(entityDir, { tolerateMissing: true });

    // 解析所有该类实体
    let items = [];
    for (const f of mdFiles) {
      try {
        const ent = await parseWikiFile(f, wikiPath, { projectResponsibilities: extractResponsibilities });
        // 按共享规则解析展示字段（project 强制补 responsibilities/tech_stack）
        const sectionFields = getSectionFields(section, module);
        const item = {};
        for (const field of sectionFields) {
          if (ent.fields[field] !== undefined) {
            item[field] = ent.fields[field];
          }
        }
        // 保留 wikilink 供前端展示关系
        item._links = ent.links;
        item._path = ent.path;
        items.push(item);
      } catch {}
    }

    // 排序（共享规则：start→end→date 回退，缺失恒排最后）
    items = sortEntities(items, (config.order && config.order[module]) || section.order || 'desc');

    // emphasize — 强调项排前面
    if (Array.isArray(config.emphasize)) {
      const emph = config.emphasize.find((e) => e.module === module);
      if (emph && Array.isArray(emph.items)) {
        items.sort((a, b) => {
          const aName = a.name || a.title || a.company || '';
          const bName = b.name || b.title || b.company || '';
          const aEmph = emph.items.some((i) => String(aName).includes(String(i)));
          const bEmph = emph.items.some((i) => String(bName).includes(String(i)));
          if (aEmph && !bEmph) return -1;
          if (!aEmph && bEmph) return 1;
          return 0;
        });
      }
    }

    // hide — 仅从当前简历排除实体，Wiki 文件保持不变（共享规则）
    items = applyHide(items, config.hide, module);

    // privacy — 脱敏（共享规则：6 字段统一语义，mask_salary/company/github 也生效）
    const privacy = config.privacy || DEFAULT_PRIVACY;
    items = items.map((item) => maskItemFields(item, privacy));

    // group_by 分组
    if (section.group_by) {
      sections.push({
        module,
        title: section.title,
        grouped: true,
        group_by: section.group_by,
        groups: groupByItems(items, section.group_by),
      });
    } else {
      sections.push({
        module,
        title: section.title,
        grouped: false,
        items,
      });
    }
  }

  // person 单独处理（取第一个 person 实体）
  let personData = null;
  const personDir = join(wikiPath, 'persons');
  const personFiles = await collectMarkdown(personDir, { tolerateMissing: true });
  if (personFiles.length > 0) {
    try {
      const ent = await parseWikiFile(personFiles[0], wikiPath, { projectResponsibilities: extractResponsibilities });
      personData = { ...ent.fields };
      personData._links = ent.links;
      personData._path = ent.path;

      // person 也应用脱敏（共享规则，_ 开头元字段跳过）
      const privacy = config.privacy || DEFAULT_PRIVACY;
      personData = maskItemFields(personData, privacy);

      // person 隐藏字段
      if (Array.isArray(config.hide)) {
        const hideEntry = config.hide.find((h) => h.module === 'person');
        if (hideEntry && Array.isArray(hideEntry.fields)) {
          for (const f of hideEntry.fields) {
            delete personData[f];
          }
        }
      }
    } catch {}
  }

  // 统计实体数
  let entityCount = 0;
  for (const s of sections) {
    entityCount += s.grouped
      ? s.groups.reduce((sum, g) => sum + g.items.length, 0)
      : s.items.length;
  }

  return {
    resume: {
      name: config.name || '',
      id: config.id || '',
      template: config.template || template.id,
    },
    person: personData,
    sections,
    meta: {
      generated_at: new Date().toISOString(),
      entity_count: entityCount,
      template: template.id,
      resume_config: config.id || '',
    },
  };
}
