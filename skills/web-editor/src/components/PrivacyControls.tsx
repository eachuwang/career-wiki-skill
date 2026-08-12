/** 隐私预览设置：顶栏显示摘要，具体选项收进弹出面板。 */

import { useEffect, useRef } from 'react';
import type { PrivacyConfig } from '../types';
import UiIcon from './UiIcon';

interface PrivacyControlsProps {
  config: PrivacyConfig;
  open: boolean;
  onChange: (config: PrivacyConfig) => void;
  onOpenChange: (open: boolean) => void;
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
  { key: 'mask_salary', label: '薪资', description: '[薪资已隐藏]' },
  { key: 'mask_company', label: '公司', description: '[公司已隐藏]' },
  { key: 'mask_github', label: 'GitHub', description: '[GitHub已隐藏]' },
];

export default function PrivacyControls({ config, open, onChange, onOpenChange }: PrivacyControlsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const enabledCount = TOGGLES.filter((toggle) => !!config[toggle.key]).length;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [onOpenChange, open]);

  const toggle = (key: keyof PrivacyConfig) => {
    onChange({ ...config, [key]: !config[key] });
  };

  return (
    <div className="privacy-controls no-print" ref={rootRef}>
      <button
        type="button"
        className="privacy-summary-button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpenChange(!open)}
      >
        <UiIcon name={enabledCount > 0 ? 'eye-off' : 'eye'} size={16} />
        <span>隐私</span>
        <span className="privacy-summary-count">{enabledCount}/6</span>
        <UiIcon name="chevron-down" size={13} />
      </button>

      {open && (
        <div className="privacy-popover" role="menu" aria-label="隐私预览设置">
          <div className="privacy-popover-header">
            <strong>隐私预览</strong>
            <span>只影响预览与导出</span>
          </div>
          <div className="privacy-option-grid">
            {TOGGLES.map((item) => (
              <label key={item.key} className="privacy-option" title={`脱敏效果: ${item.description}`}>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                <input
                  type="checkbox"
                  checked={!!config[item.key]}
                  onChange={() => toggle(item.key)}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
