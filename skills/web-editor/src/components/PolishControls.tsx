import type { ResumePolishVariant } from '../types';
import UiIcon from './UiIcon';

/** 温度档与中文标签的映射；未知温度回退为数值。 */
const POLISH_VARIANT_LABELS: Array<[number, string]> = [
  [0.3, '保守'],
  [0.7, '标准'],
  [1, '大胆'],
];

function polishVariantLabel(temperature: number): string {
  const matched = POLISH_VARIANT_LABELS.find(([value]) => Math.abs(value - temperature) < 0.01);
  return matched ? matched[1] : String(temperature);
}

/** 当前简历的 AI 润色开关、多温度版本切换和 provider 配置入口。 */
interface PolishControlsProps {
  enabled: boolean;
  hasEntries: boolean;
  generating: boolean;
  providerConfigured: boolean;
  settingsOpen: boolean;
  selectedFieldCount?: number;
  variants?: ResumePolishVariant[];
  selectedVariant?: number;
  onChange: (enabled: boolean) => void;
  onOpenSettings: () => void;
  onRegenerateAll: () => void;
  onSelectVariant: (index: number) => void;
}

export default function PolishControls({
  enabled,
  hasEntries,
  generating,
  providerConfigured,
  settingsOpen,
  selectedFieldCount = 0,
  variants = [],
  selectedVariant = 0,
  onChange,
  onOpenSettings,
  onRegenerateAll,
  onSelectVariant,
}: PolishControlsProps) {
  const status = generating ? '生成中' : enabled ? (hasEntries ? '已开启' : '等待结果') : '';

  return (
    <div
      className={`polish-controls ${enabled ? 'is-enabled' : ''} ${settingsOpen ? 'is-settings-open' : ''}`}
      title={
        enabled
          ? hasEntries
            ? '显示已通过原文校验的 AI 润色结果'
            : '已开启 AI 润色，但当前简历还没有可用的润色结果，将继续显示原文'
          : '关闭 AI 润色，显示用户原始输入'
      }
    >
      <span className="polish-controls-label">
        润色
        {status && <span className="polish-controls-status">{status}</span>}
        <span className="polish-controls-fields">{selectedFieldCount} 项</span>
      </span>

      {variants.length > 1 && (
        <span className="polish-variants" role="radiogroup" aria-label="润色版本">
          {variants.map((variant, index) => (
            <button
              key={index}
              type="button"
              className={`polish-variant-option ${index === selectedVariant ? 'is-active' : ''}`}
              role="radio"
              aria-checked={index === selectedVariant}
              title={`版本 ${index + 1}（温度 ${variant.temperature}）`}
              onClick={() => onSelectVariant(index)}
            >
              {polishVariantLabel(variant.temperature)}
            </button>
          ))}
        </span>
      )}

      <button
        type="button"
        className="polish-refresh-button"
        disabled={generating}
        onClick={onRegenerateAll}
        aria-label="重新生成润色"
        title={providerConfigured ? '用当前模型重新生成多温度版本' : '请先配置 Base URL、API Key 和模型'}
      >
        <UiIcon name="refresh" size={16} />
      </button>

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="AI 润色"
        className="polish-switch"
        disabled={generating}
        onClick={() => onChange(!enabled)}
      >
        <span className="polish-switch-thumb" />
      </button>
      <button
        type="button"
        className={`polish-settings-button ${providerConfigured ? '' : 'is-unconfigured'}`}
        onClick={onOpenSettings}
        aria-label="配置 AI 润色模型"
        title={providerConfigured ? '配置 AI 润色模型' : '请先配置 API Key、Base URL 和模型'}
      >
        <UiIcon name="settings" size={16} />
      </button>
    </div>
  );
}