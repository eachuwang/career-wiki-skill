/**
 * resume-rules.test.mjs — 共享渲染规则回归测试
 *
 * 守护前后端共用的确定性规则（脱敏/排序/字段选择/隐藏/分组/默认隐私），
 * 防止任一侧重新引入「一条规则两个实现」。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRIVACY,
  maskValue,
  dateSortKey,
  sortEntities,
  getSectionFields,
  applyHide,
  groupByItems,
  maskItemFields,
} from '../scripts/resume-rules.mjs';

const ALL_ON = {
  mask_name: true,
  mask_phone: true,
  mask_email: true,
  mask_company: true,
  mask_salary: true,
  mask_github: true,
};

test('maskValue 覆盖 6 类字段统一语义', () => {
  assert.equal(maskValue('王二', 'name', ALL_ON), '王*');
  assert.equal(maskValue('王', 'name', ALL_ON), '王'); // 单字名不脱敏
  assert.equal(maskValue('13812345678', 'phone', ALL_ON), '138****5678');
  assert.equal(maskValue('13812345678', 'mobile', ALL_ON), '138****5678'); // 11 位数字自动识别
  assert.equal(maskValue('wang@example.com', 'email', ALL_ON), 'w***@example.com');
  assert.equal(maskValue('字节跳动', 'company', ALL_ON), '[公司已隐藏]');
  assert.equal(maskValue('30000', 'salary', ALL_ON), '[薪资已隐藏]');
  assert.equal(maskValue('github.com/x', 'github', ALL_ON), '[GitHub已隐藏]');
  // 未开启的字段原样返回
  assert.equal(maskValue('王二', 'name', DEFAULT_PRIVACY), '王二');
  // 空值返回空串
  assert.equal(maskValue('', 'name', ALL_ON), '');
});

test('maskItemFields 逐字段脱敏且跳过 _ 元字段', () => {
  const masked = maskItemFields(
    { name: '王二', phone: '13812345678', _path: 'skills/go.md', _links: [] },
    ALL_ON,
  );
  assert.equal(masked.name, '王*');
  assert.equal(masked.phone, '138****5678');
  assert.equal(masked._path, 'skills/go.md'); // 元字段保留
});

test('dateSortKey 语义：present 大值 / YYYY-MM 数值 / 无法解析 null', () => {
  assert.equal(dateSortKey('present'), 999999);
  assert.equal(dateSortKey('至今'), 999999);
  assert.equal(dateSortKey('2024-09'), 202409);
  assert.equal(dateSortKey(''), null);
  assert.equal(dateSortKey('随便'), null);
});

test('sortEntities 按 start→end→date 回退，缺失恒排最后，支持 asc/desc', () => {
  const items = [
    { start: '2023-06', end: '2024-09' },
    { start: '2025-01' }, // 最新
    { date: '2021-01' }, // 只有 date 回退
    { company: '无时间' }, // 缺失
  ];
  const desc = sortEntities(items, 'desc');
  assert.equal(desc[0].start, '2025-01');
  assert.equal(desc[1].start, '2023-06');
  assert.equal(desc[2].date, '2021-01');
  assert.equal(desc[3].company, '无时间'); // 缺失最后

  const asc = sortEntities(items, 'asc');
  assert.equal(asc[0].date, '2021-01');
  assert.equal(asc[asc.length - 1].company, '无时间'); // 缺失仍最后
});

test('sortEntities 兼容 fields 嵌套结构（WikiEntity）', () => {
  const items = [{ fields: { start: '2022-01' } }, { fields: { start: '2024-01' } }];
  const desc = sortEntities(items, 'desc');
  assert.equal(desc[0].fields.start, '2024-01');
});

test('getSectionFields 兜底 + project 强制补 responsibilities/tech_stack', () => {
  assert.deepEqual(getSectionFields(undefined, 'experience'), [
    'company', 'role', 'start', 'end', 'description',
  ]);
  // project 从模板 fields 补插 responsibilities/tech_stack（description 之后）
  const fields = getSectionFields({ fields: ['name', 'description', 'role', 'start', 'end'] }, 'project');
  assert.deepEqual(fields, [
    'name', 'description', 'responsibilities', 'tech_stack', 'role', 'start', 'end',
  ]);
  // 已含 responsibilities 时不再重复
  const fields2 = getSectionFields(
    { fields: ['name', 'description', 'responsibilities', 'tech_stack'] },
    'project',
  );
  assert.deepEqual(fields2, ['name', 'description', 'responsibilities', 'tech_stack']);
});

test('applyHide 按 _path/path 排除条目 + 删除隐藏字段', () => {
  const items = [
    { name: 'a', _path: 'projects/a.md', desc: 'x' },
    { name: 'b', _path: 'projects/b.md', desc: 'y' },
  ];
  const hide = [{ module: 'project', items: ['projects/a.md'], fields: ['desc'] }];
  const result = applyHide(items, hide, 'project');
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'b');
  assert.equal('desc' in result[0], false);
  // 其他 module 的 hide 不影响
  assert.equal(applyHide(items, [{ module: 'skill', items: ['projects/a.md'] }], 'project').length, 2);
});

test('groupByItems 按字段分组，缺省归「其他」', () => {
  const items = [
    { category: '语言' },
    { category: '语言' },
    { fields: { category: '框架' } }, // 嵌套结构
    { name: '无分类' },
  ];
  const groups = groupByItems(items, 'category');
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g.items.length]));
  assert.equal(byKey['语言'], 2);
  assert.equal(byKey['框架'], 1);
  assert.equal(byKey['其他'], 1);
});
