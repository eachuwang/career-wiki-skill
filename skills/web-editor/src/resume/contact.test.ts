import assert from 'node:assert/strict';
import test from 'node:test';
import { getResumeContactItems } from './contact.ts';

/** 以用户可见的联系方式顺序验证字段、图标和文本的一一对应。 */
test('个人信息联系方式映射为语义匹配的 SVG 图标项', () => {
  const contacts = getResumeContactItems({
    email: 'hello@example.com',
    phone: '13800138000',
    github: 'github.com/example',
    website: 'example.com',
  });

  assert.deepEqual(contacts, [
    { field: 'email', icon: 'mail', value: 'hello@example.com' },
    { field: 'phone', icon: 'phone', value: '13800138000' },
    { field: 'github', icon: 'github', value: 'github.com/example' },
    { field: 'website', icon: 'globe', value: 'example.com' },
  ]);
});

/** 空联系方式不应留下无意义的图标或占位间隔。 */
test('个人信息联系方式忽略空值', () => {
  const contacts = getResumeContactItems({
    email: '',
    phone: null,
    github: 'github.com/example',
  });

  assert.deepEqual(contacts, [
    { field: 'github', icon: 'github', value: 'github.com/example' },
  ]);
});
