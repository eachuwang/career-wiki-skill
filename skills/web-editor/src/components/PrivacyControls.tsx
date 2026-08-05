/**
 * PrivacyControls — 脱敏设置面板
 *
 * 6 个字段开关，实时控制预览脱敏效果。
 * 对应 privacy-filter skill 的 6 个规则。
 */

import type { PrivacyConfig } from '../types';

interface PrivacyControlsProps {
  config: PrivacyConfig;
  onChange: (config: PrivacyConfig) => void;
}

interface ToggleItem {
  key: keyof PrivacyConfig;
  label: string;
  description: string;
}

const TOGGLES: ToggleItem[] = [
  { key: 'mask_name', label: '姓名', description: '王**' },
  { key: 'mask_phone', label: '电话', description: '138****5678' },
  { key: 'mask_email', label: '邮箱', description: 'w***@example.com' },
];

export default function PrivacyControls({
  config,
  onChange,
}: PrivacyControlsProps) {
  /** 仅更新当前简历的脱敏配置，保持其他选项不变。 */
  const toggle = (key: keyof PrivacyConfig) => {
    onChange({ ...config, [key]: !config[key] });
  };

  return (
    <div className="flex items-center gap-3 no-print">
      <span className="text-xs font-medium text-ink-500">隐私预览</span>
      {TOGGLES.map((t) => (
        <label
          key={t.key}
          className="privacy-toggle"
          title={`脱敏效果: ${t.description}`}
        >
          <input
            type="checkbox"
            checked={!!config[t.key]}
            onChange={() => toggle(t.key)}
            className="rounded text-brand-500 focus:ring-brand-300"
          />
          {t.label}
        </label>
      ))}
    </div>
  );
}
