/**
 * assembler.test.mjs — assembleResume 行为测试（H② compile 可测 seam）
 *
 * 目标：把「wiki markdown → 结构化简历 JSON」主链路从「无测试」变成「有行为测试」。
 * 喂一个最小可用 fixture wiki，断言产出 JSON 的结构语义（模块顺序 / 字段选择 / 脱敏生效），
 * 不锁 SKILL.md 措辞、不断言实现细节文本。
 *
 * 测试范式复用 resume-rules.test.mjs：纯函数直测，node:test，断言语义而非文本。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleResume } from './assembler.mjs';

/**
 * 构造最小可用 fixture wiki：一个 person、一个 experience、两个 project（含 responsibilities/tech_stack）。
 * 目的不是覆盖全 schema，而是给 assembleResume 一条可断言主链路。
 */
async function createFixtureWiki() {
  const root = await mkdtemp(join(tmpdir(), 'cws-assembler-'));
  await mkdir(join(root, 'wiki', 'persons'), { recursive: true });
  await mkdir(join(root, 'wiki', 'experiences'), { recursive: true });
  await mkdir(join(root, 'wiki', 'projects'), { recursive: true });
  await mkdir(join(root, 'templates'), { recursive: true });

  await writeFile(
    join(root, 'wiki', 'persons', 'wang.md'),
    `---
entity: person
name: 王二
title: 后端工程师
phone: 13812345678
email: wang@example.com
github: github.com/wang
---
个人说明。
`,
  );

  await writeFile(
    join(root, 'wiki', 'experiences', 'bytedance.md'),
    `---
entity: experience
company: 字节跳动
role: 后端开发
start: 2023-06
end: present
---
做了一些事。
`,
  );

  // 两个 project：旧版 B 在前（start 更早），新版 A 在后 —— 验证 desc 排序
  await writeFile(
    join(root, 'wiki', 'projects', 'old-platform.md'),
    `---
entity: project
name: 旧平台
role: 开发者
start: 2021-01
end: 2022-06
description: 老系统。
responsibilities: 维护老系统
tech_stack: Java
---
`,
  );
  await writeFile(
    join(root, 'wiki', 'projects', 'new-platform.md'),
    `---
entity: project
name: 新平台
role: 负责人
start: 2023-01
end: present
description: 新系统。
responsibilities: 主导架构
tech_stack: Go
---
`,
  );

  await writeFile(
    join(root, 'templates', 'tech-minimal.json'),
    JSON.stringify({
      id: 'tech-minimal',
      sections: [
        { module: 'project', title: '项目经验', fields: ['name', 'role', 'start', 'end', 'description'] },
        { module: 'experience', title: '工作经历', fields: ['company', 'role', 'start', 'end'] },
      ],
    }),
  );

  return root;
}

test('assembleResume 主链路：模块顺序遵循 config.modules，字段选择遵循 template.fields', async () => {
  const root = await createFixtureWiki();
  try {
    const template = {
      id: 'tech-minimal',
      sections: [
        { module: 'project', title: '项目经验', fields: ['name', 'role', 'start', 'end', 'description'] },
        { module: 'experience', title: '工作经历', fields: ['company', 'role', 'start', 'end'] },
      ],
    };
    // config.modules 把 experience 提前 → 输出顺序应为 experience → project（覆盖模板顺序）
    const config = {
      id: 'test-resume',
      name: '测试简历',
      template: 'tech-minimal',
      modules: ['experience', 'project'],
    };

    const out = await assembleResume(config, template, root);

    // 断言 1：sections 顺序遵循 config.modules（experience 在前）
    assert.deepEqual(
      out.sections.map((s) => s.module),
      ['experience', 'project'],
    );

    // 断言 2：字段只含 template.fields 声明的（experience 条目不含 description）
    const expItem = out.sections[0].items[0];
    assert.deepEqual(Object.keys(expItem).filter((k) => !k.startsWith('_')).sort(),
      ['company', 'end', 'role', 'start'].sort());

    // 断言 3：project 强制补 responsibilities/tech_stack（即便 template.fields 没列）
    const projItem = out.sections[1].items[0];
    assert.ok('responsibilities' in projItem, 'project 条目应含 responsibilities');
    assert.ok('tech_stack' in projItem, 'project 条目应含 tech_stack');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('assembleResume 排序：project 默认 desc，最新 start 排第一', async () => {
  const root = await createFixtureWiki();
  try {
    const template = {
      id: 'tech-minimal',
      sections: [{ module: 'project', title: '项目经验', fields: ['name', 'start', 'end'] }],
    };
    const config = { id: 'r', name: 'n', template: 'tech-minimal', modules: ['project'] };

    const out = await assembleResume(config, template, root);
    // 新平台 start=2023-01 应排在 旧平台 start=2021-01 之前（desc）
    assert.equal(out.sections[0].items[0].name, '新平台');
    assert.equal(out.sections[0].items[1].name, '旧平台');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('assembleResume 脱敏：privacy 开启后 person 字段被脱敏，_ 元字段保留', async () => {
  const root = await createFixtureWiki();
  try {
    const template = {
      id: 'tech-minimal',
      sections: [{ module: 'experience', title: '工作经历', fields: ['company', 'role'] }],
    };
    const config = {
      id: 'r',
      name: 'n',
      template: 'tech-minimal',
      modules: ['experience'],
      privacy: {
        mask_name: true,
        mask_phone: true,
        mask_email: true,
        mask_github: true,
      },
    };

    const out = await assembleResume(config, template, root);

    // person 脱敏生效
    assert.equal(out.person.name, '王*'); // 2 字名保留首字 + *
    assert.equal(out.person.phone, '138****5678');
    assert.equal(out.person.email, 'w***@example.com');
    assert.equal(out.person.github, '[GitHub已隐藏]');
    // _ 元字段保留不脱敏
    assert.ok(out.person._path, '_path 应保留');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('assembleResume meta：entity_count 与 template.id 正确反映输入', async () => {
  const root = await createFixtureWiki();
  try {
    const template = {
      id: 'tech-minimal',
      sections: [
        { module: 'project', title: '项目', fields: ['name'] },
        { module: 'experience', title: '经历', fields: ['company'] },
      ],
    };
    const config = { id: 'r42', name: 'n', template: 'tech-minimal', modules: ['project', 'experience'] };

    const out = await assembleResume(config, template, root);
    // 2 个 project + 1 个 experience = 3
    assert.equal(out.meta.entity_count, 3);
    assert.equal(out.meta.template, 'tech-minimal');
    assert.equal(out.meta.resume_config, 'r42');
    assert.equal(out.resume.id, 'r42');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
