import type { TemplateConfig, TemplatePreset } from '../types/index.ts';

import tech from '../../templates/tech-minimal.json' with { type: 'json' };
import business from '../../templates/business-sidebar.json' with { type: 'json' };
import creative from '../../templates/creative-color.json' with { type: 'json' };
import academic from '../../templates/academic-plain.json' with { type: 'json' };

const sections: TemplateConfig['sections'] = [
  { module: 'person', title: '个人信息', fields: ['name', 'current_title', 'email', 'phone', 'github', 'website'] },
  { module: 'summary', title: '个人优势', fields: ['content'] },
  { module: 'experience', title: '工作经历', fields: ['company', 'role', 'start', 'end', 'location', 'description', 'responsibilities'], order: 'desc' },
  { module: 'project', title: '项目经验', fields: ['name', 'role', 'start', 'end', 'description', 'responsibilities', 'tech_stack', 'url'] },
  { module: 'skill', title: '技能', fields: ['name', 'category', 'level'], group_by: 'category' },
  { module: 'education', title: '教育背景', fields: ['school', 'degree', 'major', 'start', 'end'] },
];

const labels = { clear: '清晰', compact: '紧凑', editorial: '编辑式' } as const;
const officialLayouts = [
  [tech, '技术索引', 'index'],
  [business, '商务双区', 'split'],
  [creative, '色带作品集', 'band'],
  [academic, '经典履历', 'classic'],
] as const;

export const TEMPLATE_PRESETS: TemplateConfig[] = [
  ...Object.entries(labels).map(([preset, name]) => ({
    id: 'preset-' + preset,
    name,
    layout: 'single-column' as const,
    style: 'resume.css',
    preset: preset as keyof typeof labels,
    sections,
  })),
  ...officialLayouts.map(([definition, name, preset]): TemplateConfig => ({
    id: definition.id,
    name,
    layout: 'single-column',
    style: 'resume.css',
    preset,
    sections: definition.sections.map((section) => ({
      module: section.module as TemplateConfig['sections'][number]['module'],
      title: section.title,
      fields: section.fields,
      ...('order' in section && section.order === 'desc' ? { order: 'desc' as const } : {}),
      ...('group_by' in section && typeof section.group_by === 'string' ? { group_by: section.group_by } : {}),
    })),
  })),
];

export function getTemplatePreset(template: TemplateConfig | null): TemplatePreset {
  const preset = template?.preset;
  if (preset && TEMPLATE_PRESETS.some((item) => item.preset === preset)) return preset;
  return TEMPLATE_PRESETS.find((item) => item.id === template?.id)?.preset ?? 'clear';
}
