import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  ResumePolishField,
  ResumePolishProtocol,
  ResumePolishProviderConfig,
} from '../types';
import { DEFAULT_POLISH_FIELDS, POLISH_FIELD_OPTIONS } from '../resume/polish';

interface PolishProviderSettingsProps {
  provider: ResumePolishProviderConfig;
  selectedFields?: ResumePolishField[];
  open: boolean;
  models: string[];
  loadingModels: boolean;
  error: string;
  onClose: () => void;
  onSave: (provider: ResumePolishProviderConfig, selectedFields: ResumePolishField[]) => void;
  onFetchModels: (provider: ResumePolishProviderConfig) => void;
}

/** 模型 provider 配置;请求协议由用户明确选择,API Key 由本地 API 保存到用户目录。
 *  以居中悬浮窗呈现(遮罩 + 卡片),Esc 或点击遮罩关闭。 */
export default function PolishProviderSettings({
  provider,
  selectedFields = DEFAULT_POLISH_FIELDS,
  open,
  models,
  loadingModels,
  error,
  onClose,
  onSave,
  onFetchModels,
}: PolishProviderSettingsProps) {
  const [draft, setDraft] = useState(provider);
  const [draftSelectedFields, setDraftSelectedFields] = useState(selectedFields);

  // draft 只在开关窗口或 provider 真正变化时重置；selectedFields 引用每次
  // snapshot 都重新计算，不能作为重置 provider 表单的触发条件。
  useEffect(() => {
    if (open) setDraft(provider);
  }, [open, provider]);

  useEffect(() => {
    if (open) setDraftSelectedFields(selectedFields);
  }, [open, selectedFields]);

  // 悬浮窗内按 Esc 关闭
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const update = (field: keyof ResumePolishProviderConfig, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: field === 'timeout_ms' ? Number(value) : value,
    }));
  };

  const dialog = (
    <div
      className="polish-settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="polish-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="AI 润色模型配置"
      >
        <div className="polish-provider-settings-header">
          <div>
            <h2>AI 润色模型</h2>
            <p>{draft.protocol === 'anthropic'
              ? 'Anthropic Messages 协议,模型名称需手动填写'
              : 'OpenAI-compatible 协议,可拉取模型列表'}</p>
          </div>
          <button type="button" className="polish-settings-close" onClick={onClose} aria-label="关闭模型配置">×</button>
        </div>

        <div className="polish-settings-grid">
          <label className="polish-settings-field">
            <span>AI 润色协议</span>
            <select
              value={draft.protocol}
              onChange={(event) => setDraft((current) => ({
                ...current,
                protocol: event.target.value as ResumePolishProtocol,
              }))}
            >
              <option value="openai">OpenAI-compatible</option>
              <option value="anthropic">Anthropic Messages</option>
            </select>
          </label>

          <label className="polish-settings-field">
            <span>请求超时</span>
            <div className="polish-timeout-field">
              <input
                type="number"
                aria-label="请求超时秒数"
                min={10}
                max={180}
                step={10}
                value={Math.round(draft.timeout_ms / 1000)}
                onChange={(event) => update('timeout_ms', String(Number(event.target.value) * 1000))}
              />
              <span>秒</span>
            </div>
          </label>
        </div>

        <div className="polish-field-settings">
          <div className="polish-field-settings-title">润色内容</div>
          <p className="polish-field-settings-description">选择需要 AI 润色的简历内容</p>
          <div className="polish-field-options">
            {POLISH_FIELD_OPTIONS.map((option) => {
              const checked = draftSelectedFields.includes(option.field);
              return (
                <label key={option.field} className="polish-field-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setDraftSelectedFields((current) => checked
                        ? current.filter((field) => field !== option.field)
                        : [...current, option.field]);
                    }}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <label className="polish-settings-field">
          <span>Base URL</span>
          <input
            value={draft.base_url}
            onChange={(event) => update('base_url', event.target.value)}
            placeholder={draft.protocol === 'anthropic'
              ? 'https://api.anthropic.com'
              : 'https://api.openai.com/v1'}
            spellCheck={false}
            autoComplete="url"
          />
        </label>
        <label className="polish-settings-field">
          <span>API Key</span>
          <input
            type="password"
            value={draft.api_key}
            onChange={(event) => update('api_key', event.target.value)}
            placeholder={draft.api_key_configured ? '已保存在本机，留空保持不变' : 'sk-...'}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="polish-settings-field">
          <span>模型</span>
          <input
            value={draft.model}
            onChange={(event) => update('model', event.target.value)}
            list="polish-model-options"
            placeholder={draft.protocol === 'anthropic' ? '手动填写模型名称' : '手动填写,或点击拉取模型'}
            spellCheck={false}
            autoComplete="off"
          />
          <datalist id="polish-model-options">
            {models.map((model) => <option value={model} key={model} />)}
          </datalist>
        </label>

        <div className="polish-settings-actions">
          <button
            type="button"
            className="toolbar-button ghost compact"
            disabled={loadingModels || draft.protocol === 'anthropic'}
            onClick={() => onFetchModels(draft)}
          >
            {loadingModels ? '拉取中…' : draft.protocol === 'anthropic' ? 'Anthropic 不支持拉取' : '拉取模型'}
          </button>
          <button type="button" className="toolbar-button primary compact" onClick={() => onSave(draft, draftSelectedFields)}>保存配置</button>
        </div>
        <p className="polish-settings-hint">每批最多处理 2 条,超时或服务繁忙时自动重试一次。Key 仅保存在本机用户目录，浏览器不会持久化。</p>
        {error && <p className="polish-settings-error" role="alert">{error}</p>}
      </div>
    </div>
  );

  // SSR 环境(无 document)直接渲染,浏览器端 portal 到 body
  if (typeof document === 'undefined') return dialog;
  return createPortal(dialog, document.body);
}
