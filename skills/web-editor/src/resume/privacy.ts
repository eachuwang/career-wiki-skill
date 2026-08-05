/**
 * privacy.ts — 编辑器脱敏默认值与 maskValue 统一入口
 *
 * maskValue 的实现来自后端 resume-rules.mjs（候选 C 已统一），
 * 前端只做 re-export，不另写一份。
 * DEFAULT_EDITOR_PRIVACY 是编辑器新建简历时的默认开关，
 * 之前在 ResumeEditor 里硬编码 3 处，现收敛到此。
 */

export { maskValue } from '../../../resume-generator/scripts/resume-rules.mjs';
import type { PrivacyConfig } from '../types';

/**
 * 新建简历的默认脱敏开关。
 * phone / email / salary 默认开启，其余关闭。
 */
export const DEFAULT_EDITOR_PRIVACY: PrivacyConfig = {
  mask_name: false,
  mask_phone: true,
  mask_email: true,
  mask_salary: true,
  mask_company: false,
  mask_github: false,
};
