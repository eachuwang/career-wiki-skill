import type {
  EntityType,
  ResumeConfig,
  TemplateConfig,
  TemplateSection,
  WikiEntity,
  WikiLink,
} from '../types/index.ts';
import { ENTITY_LABELS } from '../types/index.ts';
import { applyPolishToEntities } from './polish.ts';

export interface ResumeViewItem {
  path: string;
  fields: Record<string, unknown>;
  links: WikiLink[];
}

export interface ResumeViewGroup {
  key: string;
  items: ResumeViewItem[];
}

export interface ResumeViewSection {
  module: EntityType;
  title: string;
  fields: string[];
  grouped: boolean;
  items?: ResumeViewItem[];
  groupBy?: string;
  groups?: ResumeViewGroup[];
}

export interface ResumeView {
  resume: {
    id: string;
    name: string;
    template: string;
  };
  person: ResumeViewItem | null;
  sections: ResumeViewSection[];
  meta: {
    entity_count: number;
    template: string;
    resume_config: string;
  };
}

export interface ProjectResumeInput {
  wiki: WikiEntity[];
  config: ResumeConfig;
  template: TemplateConfig | null;
}

const FALLBACK_FIELDS: Partial<Record<EntityType, string[]>> = {
  person: ['name', 'current_title', 'email', 'phone', 'github', 'website'],
  summary: ['content'],
  experience: ['company', 'role', 'start', 'end', 'description'],
  project: ['name', 'role', 'start', 'end', 'description', 'responsibilities', 'tech_stack'],
  skill: ['name', 'level'],
  education: ['school', 'degree', 'major', 'start', 'end'],
};

function effectiveSections(config: ResumeConfig, template: TemplateConfig | null): TemplateSection[] {
  const declared = template?.sections || [];
  const declaredModules = new Set(declared.map((section) => section.module));
  return [
    ...declared,
    ...config.modules
      .filter((module) => !declaredModules.has(module))
      .map((module) => ({
        module,
        title: ENTITY_LABELS[module],
        fields: [...(FALLBACK_FIELDS[module] || ['name'])],
      })),
  ];
}

function sectionFields(section: TemplateSection): string[] {
  const fields = [...section.fields];
  if (section.module === 'project') {
    for (const field of ['responsibilities', 'tech_stack']) {
      if (!fields.includes(field)) fields.push(field);
    }
  }
  return fields;
}

/**
 * 条目时间排序键:结束时间优先(降序时最近结束的靠前)。
 * 进行中(present/至今)视为最新,排在一切已结束条目之前;
 * 缺 end 时回退 start,再回退 date。
 */
const PRESENT_END_KEY = '9999-99';

export function temporalKey(fields: Record<string, unknown>): string {
  const rawEnd = fields['end'];
  if (rawEnd) {
    const endText = String(rawEnd).trim();
    if (endText.toLowerCase() === 'present' || endText === '至今') {
      return PRESENT_END_KEY;
    }
    return endText;
  }
  const rawStart = fields['start'];
  if (rawStart) return String(rawStart);
  const rawDate = fields['date'];
  if (rawDate) return String(rawDate);
  return '';
}

function hiddenItems(config: ResumeConfig, module: EntityType): Set<string> {
  return new Set(
    (config.hide || [])
      .filter((entry) => entry.module === module)
      .flatMap((entry) => entry.items || []),
  );
}

function hiddenFields(config: ResumeConfig, module: EntityType): Set<string> {
  return new Set(
    (config.hide || [])
      .filter((entry) => entry.module === module)
      .flatMap((entry) => entry.fields || []),
  );
}

function maskValue(field: string, value: unknown, config: ResumeConfig): unknown {
  const privacy = config.privacy || {};
  const text = String(value ?? '');
  if (!text) return value;
  if (privacy.mask_phone && (field === 'phone' || /^\d{11}$/.test(text))) {
    return text.length >= 7 ? `${text.slice(0, 3)}****${text.slice(-4)}` : text;
  }
  if (privacy.mask_email && field === 'email') {
    const at = text.indexOf('@');
    return at > 0 ? `${text[0]}***${text.slice(at)}` : text;
  }
  if (privacy.mask_name && field === 'name') {
    return text.length > 1 ? `${text[0]}${'*'.repeat(text.length - 1)}` : text;
  }
  if (privacy.mask_company && field === 'company') return '[公司已隐藏]';
  if (privacy.mask_salary && field === 'salary') return '[薪资已隐藏]';
  if (privacy.mask_github && field === 'github') return '[GitHub已隐藏]';
  return value;
}

function displayEntity(entity: WikiEntity, config: ResumeConfig): WikiEntity {
  return {
    ...entity,
    fields: {
      ...entity.fields,
      ...(config.content_overrides?.[entity.path] || {}),
    },
  };
}

function omitEntityFields(entity: WikiEntity, hidden: ReadonlySet<string>): WikiEntity {
  return {
    ...entity,
    fields: Object.fromEntries(
      Object.entries(entity.fields).filter(([field]) => !hidden.has(field)),
    ),
  };
}

function projectItem(
  entity: WikiEntity,
  fields: string[],
  hidden: ReadonlySet<string>,
  config: ResumeConfig,
): ResumeViewItem {
  return {
    path: entity.path,
    fields: Object.fromEntries(
      fields
        .filter((field) => !hidden.has(field) && entity.fields[field] !== undefined)
        .map((field) => [field, maskValue(field, entity.fields[field], config)]),
    ),
    links: entity.links,
  };
}

function isEmphasized(entity: WikiEntity, values: string[]): boolean {
  const label = String(entity.fields.name || entity.fields.title || entity.fields.company || '');
  return values.some((value) => label.includes(String(value)));
}

function sortEntities(
  entities: WikiEntity[],
  order: 'asc' | 'desc',
  emphasized: string[],
): WikiEntity[] {
  return entities.sort((left, right) => {
    const leftEmphasized = isEmphasized(left, emphasized);
    const rightEmphasized = isEmphasized(right, emphasized);
    if (leftEmphasized !== rightEmphasized) return leftEmphasized ? -1 : 1;
    const comparison = temporalKey(left.fields).localeCompare(temporalKey(right.fields));
    return order === 'asc' ? comparison : -comparison;
  });
}

function projectPerson(
  wiki: WikiEntity[],
  config: ResumeConfig,
  selectedModules: EntityType[],
): ResumeViewItem | null {
  if (!selectedModules.includes('person')) return null;
  const hidden = hiddenItems(config, 'person');
  const entity = wiki.find((candidate) => candidate.entity === 'person' && !hidden.has(candidate.path));
  if (!entity) return null;
  const displayed = displayEntity(entity, config);
  return projectItem(
    displayed,
    Object.keys(displayed.fields),
    hiddenFields(config, 'person'),
    config,
  );
}

/**
 * 把 Wiki、简历配置和模板投影为预览及全部导出共用的纯 ResumeView。
 */
export function projectResume({ wiki, config, template }: ProjectResumeInput): ResumeView {
  const templateSections = effectiveSections(config, template);
  const selectedModules = config.modules.length > 0
    ? config.modules
    : templateSections.map((section) => section.module);
  const polishedWiki = applyPolishToEntities(wiki, config.polish);
  const sections: ResumeViewSection[] = selectedModules
    .filter((module) => module !== 'person')
    .map((module) => templateSections.find((section) => section.module === module))
    .filter((section): section is TemplateSection => section !== undefined)
    .map((section) => {
      const fields = sectionFields(section);
      const order = config.order?.[section.module] || section.order || 'desc';
      const hidden = hiddenItems(config, section.module);
      const omittedFields = hiddenFields(config, section.module);
      const emphasized = config.emphasize
        ?.find((entry) => entry.module === section.module)?.items || [];
      const items = sortEntities(
        polishedWiki
          .filter((entity) => entity.entity === section.module && !hidden.has(entity.path))
          .map((entity) => displayEntity(entity, config))
          .map((entity) => omitEntityFields(entity, omittedFields)),
        order,
        emphasized,
      ).map((entity) => projectItem(entity, fields, omittedFields, config));
      if (section.group_by) {
        const groups = new Map<string, ResumeViewItem[]>();
        for (const item of items) {
          const key = String(item.fields[section.group_by] || '其他');
          groups.set(key, [...(groups.get(key) || []), item]);
        }
        return {
          module: section.module,
          title: section.title,
          fields: fields.filter((field) => !omittedFields.has(field)),
          grouped: true,
          groupBy: section.group_by,
          groups: [...groups].map(([key, groupItems]) => ({ key, items: groupItems })),
        };
      }
      return {
        module: section.module,
        title: section.title,
        fields: fields.filter((field) => !omittedFields.has(field)),
        grouped: false,
        items,
      };
    });
  const entityCount = sections.reduce(
    (count, section) => count + (
      section.grouped
        ? section.groups?.reduce((groupCount, group) => groupCount + group.items.length, 0) || 0
        : section.items?.length || 0
    ),
    0,
  );

  return {
    resume: {
      id: config.id,
      name: config.name,
      template: config.template || template?.id || '',
    },
    person: projectPerson(polishedWiki, config, selectedModules),
    sections,
    meta: {
      entity_count: entityCount,
      template: template?.id || config.template,
      resume_config: config.id,
    },
  };
}
