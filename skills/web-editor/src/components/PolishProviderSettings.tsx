import { useEffect, useState } from 'react';
import type { ResumePolishField, ResumePolishProviderConfig } from '../types';
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

/** OpenAI-compatible provider 配置；API Key 仅由父层保存到浏览器本地，不进入简历配置。 */
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

  useEffect(() => {
    if (open) {
      setDraft(provider);
      setDraftSelectedFields(selectedFields);
    }
  }, [open, provider, selectedFields]);

  if (!open) return null;

  const update = (field: keyof ResumePolishProviderConfig, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: field === 'timeout_ms' ? Number(value) : value,
    }));
  };

  return (
    <div className="polish-provider-settings" role="dialog" aria-label="AI 润色模型配置">
      <div className="polish-provider-settings-header">
        <div>
          <h2>AI 润色模型</h2>
          <p>兼容 OpenAI API 的 Base URL、Key 和模型名称</p>
        </div>
        <button type="button" className="polish-settings-close" onClick={onClose} aria-label="关闭模型配置">×</button>
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
        <input value={draft.base_url} onChange={(event) => update('base_url', event.target.value)} placeholder="https://api.openai.com/v1" spellCheck={false} autoComplete="url" />
      </label>
      <label className="polish-settings-field">
        <span>API Key</span>
        <input type="password" value={draft.api_key} onChange={(event) => update('api_key', event.target.value)} placeholder="sk-..." spellCheck={false} autoComplete="off" />
      </label>
      <label className="polish-settings-field">
        <span>模型</span>
        <input value={draft.model} onChange={(event) => update('model', event.target.value)} list="polish-model-options" placeholder="手动填写，或点击拉取模型" spellCheck={false} autoComplete="off" />
        <datalist id="polish-model-options">
          {models.map((model) => <option value={model} key={model} />)}
        </datalist>
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

      <div className="polish-settings-actions">
        <button type="button" className="toolbar-button ghost compact" disabled={loadingModels} onClick={() => onFetchModels(draft)}>
          {loadingModels ? '拉取中…' : '拉取模型'}
        </button>
        <button type="button" className="toolbar-button primary compact" onClick={() => onSave(draft, draftSelectedFields)}>保存配置</button>
      </div>
      <p className="polish-settings-hint">每批最多处理 2 条，超时或服务繁忙时自动重试一次。Key 仅保存在本浏览器。</p>
      {error && <p className="polish-settings-error" role="alert">{error}</p>}
    </div>
  );
}
