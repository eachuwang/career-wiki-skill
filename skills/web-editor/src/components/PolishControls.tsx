import UiIcon from './UiIcon';

/** 当前简历的 AI 润色开关和 provider 配置入口。 */
interface PolishControlsProps {
  enabled: boolean;
  hasEntries: boolean;
  generating: boolean;
  providerConfigured: boolean;
  settingsOpen: boolean;
  selectedFieldCount?: number;
  onChange: (enabled: boolean) => void;
  onOpenSettings: () => void;
}

export default function PolishControls({
  enabled,
  hasEntries,
  generating,
  providerConfigured,
  settingsOpen,
  selectedFieldCount = 0,
  onChange,
  onOpenSettings,
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
