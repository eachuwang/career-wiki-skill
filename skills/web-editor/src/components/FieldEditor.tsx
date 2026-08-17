/**
 * FieldEditor — 单个字段编辑器(编辑窗与卡片共用)
 *
 * 输入即时同步到简历覆盖(不回写 wiki);
 * 长文本字段(项目描述/岗位职责/个人优势/技术栈)使用自动增高 textarea,
 * 短字段保持单行输入;
 * 润色字段支持「换一换」单条重生成。
 */

import { useEffect, useRef, useState } from 'react';
import type { ResumePolishConfig, ResumePolishField } from '../types';

interface FieldEditorProps {
  field: string;
  value: unknown;
  moduleId: string;
  itemPath: string;
  inputId: string;
  onOverride: (moduleId: string, itemPath: string, field: string, value: unknown) => void;
  polish?: ResumePolishConfig;
  polishSelectedFields: ResumePolishField[];
  polishGeneratingKey?: string | null;
  onRegeneratePolish?: (path: string, field: ResumePolishField) => void;
}

/** 长文本字段:多行自适应编辑框 */
const MULTILINE_FIELDS = new Set(['description', 'responsibilities', 'content', 'tech_stack']);

/** 字段展示名 */
export function getFieldLabel(field: string): string {
  return field === 'responsibilities'
    ? '岗位职责'
    : field === 'description'
      ? '项目描述'
      : field === 'content'
        ? '个人优势'
        : field === 'tech_stack'
          ? '技术栈'
          : field;
}

export default function FieldEditor({
  field,
  value,
  moduleId,
  itemPath,
  inputId,
  onOverride,
  polish,
  polishSelectedFields,
  polishGeneratingKey,
  onRegeneratePolish,
}: FieldEditorProps) {
  const externalValue = String(value ?? '');
  const [localVal, setLocalVal] = useState(externalValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isMultiline = MULTILINE_FIELDS.has(field);

  useEffect(() => {
    setLocalVal(externalValue);
  }, [externalValue]);

  // 多行编辑框随内容自动增高
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !isMultiline) return;
    el.style.height = 'auto';
    el.style.height = Math.max(76, el.scrollHeight + 2) + 'px';
  }, [localVal, isMultiline]);

  const fieldLabel = getFieldLabel(field);
  const isPolishField = field === 'description' || field === 'responsibilities' || field === 'content';
  const polishField = isPolishField ? field as ResumePolishField : null;
  const canRegenerate = Boolean(
    polishField &&
      polishSelectedFields.includes(polishField) &&
      polish?.entries?.[itemPath]?.fields?.[polishField],
  );
  const isRegenerating = polishField ? polishGeneratingKey === itemPath + ':' + polishField : false;

  return (
    <div className={'field-editor ' + (isMultiline ? 'is-multiline' : '')}>
      <label htmlFor={inputId} className="field-editor-label">
        {fieldLabel}
      </label>
      {isMultiline ? (
        <textarea
          id={inputId}
          ref={textareaRef}
          rows={3}
          value={localVal}
          onChange={(e) => {
            setLocalVal(e.target.value);
            onOverride(moduleId, itemPath, field, e.target.value);
          }}
          className="field-editor-input field-editor-textarea"
        />
      ) : (
        <input
          id={inputId}
          type="text"
          value={localVal}
          onChange={(e) => {
            setLocalVal(e.target.value);
            onOverride(moduleId, itemPath, field, e.target.value);
          }}
          className="field-editor-input"
        />
      )}
      {canRegenerate && polishField && onRegeneratePolish && (
        <button
          type="button"
          className="polish-regenerate-button"
          disabled={isRegenerating}
          onClick={() => onRegeneratePolish(itemPath, polishField)}
        >
          {isRegenerating ? '生成中…' : '换一换'}
        </button>
      )}
    </div>
  );
}
