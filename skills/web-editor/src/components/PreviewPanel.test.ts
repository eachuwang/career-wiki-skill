import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

/** SSR 测试只验证导出入口布局，不执行实际下载。 */
function noOp(): void {}

/** 通过 Vite 的公开 SSR 入口加载 TSX，避免测试依赖组件内部实现。 */
async function renderPreview(overrides: Record<string, unknown> = {}): Promise<string> {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const previewModule = await server.ssrLoadModule('/src/components/PreviewPanel.tsx');
    return renderToStaticMarkup(
      createElement(previewModule.default, {
        modules: [
          {
            id: 'person-module',
            type: 'person',
            label: '个人信息',
            expanded: true,
            overrides: {},
            hiddenItemIds: [],
          },
        ],
        wikiEntities: [
          {
            path: 'person/profile.md',
            entity: 'person',
            title: '',
    trustTier: 'unverified',
            sources: [],
            relations: [],
            links: [],
            fields: {
              name: '张三',
              email: 'hello@example.com',
              phone: '13800138000',
              github: 'github.com/example',
              website: 'example.com',
            },
          },
        ],
        template: null,
        privacy: {},
        resumeName: '测试简历',
        onOpenExport: noOp,
        ...overrides,
      }),
    );
  } finally {
    await server.close();
  }
}

/** 用户在预览区看到的每项联系方式都应带有一个 SVG 图标。 */
async function previewShowsContactIcons(): Promise<void> {
  const html = await renderPreview();
  const contactMarkup = html.match(
    /<div class="resume-contact">([\s\S]*?)<\/div>/,
  )?.[1];

  assert.ok(contactMarkup, '应渲染联系方式区域');
  assert.equal(contactMarkup.match(/<svg\b/g)?.length, 4);
  assert.match(contactMarkup, /hello@example\.com/);
  assert.match(contactMarkup, /13800138000/);
  assert.match(contactMarkup, /github\.com\/example/);
  assert.match(contactMarkup, /example\.com/);
}

test('预览区为每项联系方式渲染 SVG 图标', previewShowsContactIcons);

/** 预览工具栏只保留一个导出入口，格式选择延后到导出面板。 */
async function previewOwnsSingleExportActionSet(): Promise<void> {
  const html = await renderPreview();

  assert.equal(html.match(/>\s*导出\s*</g)?.length, 1);
  assert.doesNotMatch(html, />\s*HTML\s*</);
  assert.doesNotMatch(html, />\s*JSON\s*</);
}

test('预览工具栏只保留一个导出入口', previewOwnsSingleExportActionSet);

test('内容编排中编辑项目字段后，预览立即显示该条目的覆盖值', async () => {
  const html = await renderPreview({
    modules: [
      {
        id: 'project-module',
        type: 'project',
        label: '项目经验',
        expanded: true,
        overrides: {
          'projects/data-agent.md': { description: '用户编辑后的项目描述。' },
        },
        hiddenItemIds: [],
      },
    ],
    wikiEntities: [
      {
        path: 'projects/data-agent.md',
        entity: 'project',
        title: '',
    trustTier: 'unverified',
        sources: [],
        relations: [],
        links: [],
        fields: {
          name: '数据智能体',
          description: 'Wiki 原始项目描述。',
        },
      },
      {
        path: 'projects/other.md',
        entity: 'project',
        title: '',
    trustTier: 'unverified',
        sources: [],
        relations: [],
        links: [],
        fields: {
          name: '其他项目',
          description: '其他项目保持原文。',
        },
      },
    ],
  });

  assert.match(html, /用户编辑后的项目描述。/);
  assert.doesNotMatch(html, /Wiki 原始项目描述。/);
  assert.match(html, /其他项目保持原文。/);
});

/** 旧模板未声明新字段时，项目预览也应兼容显示岗位职责和技术栈。 */
async function previewShowsProjectResponsibilities(): Promise<void> {
  const html = await renderPreview({
    modules: [
      {
        id: 'project-module',
        type: 'project',
        label: '项目经验',
        expanded: true,
        overrides: {},
        hiddenItemIds: [],
      },
    ],
    wikiEntities: [
      {
        path: 'projects/data-agent.md',
        entity: 'project',
        title: '',
    trustTier: 'unverified',
        sources: [],
        relations: [],
        links: [],
        fields: {
          name: '数据智能体',
          role: '大模型应用工程师',
          start: '2024-01',
          end: 'present',
          description: '自动生成数据接入脚本。',
          responsibilities: '解析数据字典；生成 DDL 与 ETL 脚本。',
          tech_stack: 'Node.js、PostgreSQL、LangChain',
        },
      },
    ],
    template: {
      id: 'legacy-template',
      name: '旧模板',
      sections: [
        {
          module: 'project',
          title: '项目经验',
          fields: ['name', 'role', 'start', 'end', 'description'],
        },
      ],
    },
  });

  assert.match(html, /项目描述：/);
  assert.match(html, /岗位职责：/);
  assert.match(html, /技术栈：/);
  assert.ok(html.indexOf('项目描述：') < html.indexOf('岗位职责：'));
  assert.ok(html.indexOf('岗位职责：') < html.indexOf('技术栈：'));
  assert.match(html, /项目描述：<\/span>自动生成数据接入脚本。/);
  assert.match(html, /解析数据字典；生成 DDL 与 ETL 脚本。/);
  assert.match(html, /技术栈：<\/span>Node.js、PostgreSQL、LangChain/);
}

test('项目预览兼容显示岗位职责和技术栈字段', previewShowsProjectResponsibilities);
