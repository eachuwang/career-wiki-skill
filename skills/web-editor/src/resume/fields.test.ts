import assert from 'node:assert/strict';
import test from 'node:test';
import { getOrderedEntityFieldEntries } from './fields.ts';

test('项目编辑字段中岗位职责和技术栈依次紧跟项目描述', () => {
  const entries = getOrderedEntityFieldEntries('project', {
    name: '数据智能体',
    description: '项目描述内容',
    at_company: '某公司',
    responsibilities: '岗位职责内容',
  });

  assert.deepEqual(
    entries.map(([field]) => field),
    ['name', 'description', 'responsibilities', 'tech_stack', 'at_company'],
  );
  assert.equal(entries.find(([field]) => field === 'tech_stack')?.[1], '');
});
