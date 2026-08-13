import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExportResult, ResumeExportFormat } from '../resume/browserExport';
import UiIcon from './UiIcon';

interface ExportDialogProps {
  open: boolean;
  resumeName: string;
  privacyEnabledCount: number;
  onClose: () => void;
  onExport: (format: ResumeExportFormat, filename: string) => Promise<ExportResult>;
}

const FORMAT_OPTIONS: Array<{
  id: ResumeExportFormat;
  label: string;
  description: string;
  icon: 'download' | 'code' | 'file';
}> = [
  { id: 'pdf', label: 'PDF', description: '投递与打印', icon: 'download' },
  { id: 'html', label: 'HTML', description: '网页与归档', icon: 'code' },
  { id: 'json', label: 'JSON', description: '数据交换', icon: 'file' },
];

function stripKnownExtension(filename: string): string {
  return filename.replace(/\.(pdf|html|json)$/i, '').trim();
}

export default function ExportDialog({
  open,
  resumeName,
  privacyEnabledCount,
  onClose,
  onExport,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ResumeExportFormat>('pdf');
  const [filename, setFilename] = useState(() => stripKnownExtension(resumeName));
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const filenameId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setFilename(stripKnownExtension(resumeName));
    setError('');
  }, [open, resumeName]);

  useEffect(() => {
    if (!open) return undefined;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !exporting) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      previousActiveElement?.focus();
    };
  }, [exporting, onClose, open]);

  if (!open || typeof document === 'undefined') return null;
  const supportsSavePicker = 'showSaveFilePicker' in window;

  const handleSubmit = async () => {
    const nextFilename = stripKnownExtension(filename);
    if (!nextFilename) {
      setError('请输入文件名');
      return;
    }
    setExporting(true);
    setError('');
    try {
      const result = await onExport(format, nextFilename);
      if (result === 'saved') onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  };

  return createPortal(
    <div className="export-dialog-backdrop no-print" onMouseDown={() => !exporting && onClose()}>
      <div
        ref={dialogRef}
        className="export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="export-dialog-header">
          <div>
            <span className="export-dialog-kicker">完成并分享</span>
            <h2 id="export-dialog-title">导出简历</h2>
          </div>
          <button
            type="button"
            className="export-dialog-close"
            onClick={onClose}
            disabled={exporting}
            aria-label="关闭导出面板"
          >
            <UiIcon name="close" size={18} />
          </button>
        </header>

        <section className="export-dialog-section" aria-labelledby="export-format-label">
          <div className="export-field-label" id="export-format-label">文件格式</div>
          <div className="export-format-grid" role="radiogroup" aria-labelledby="export-format-label">
            {FORMAT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={format === option.id}
                className="export-format-option"
                onClick={() => setFormat(option.id)}
              >
                <UiIcon name={option.icon} size={18} />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <label className="export-dialog-section" htmlFor={filenameId}>
          <span className="export-field-label">文件名</span>
          <div className="export-filename-control">
            <input
              id={filenameId}
              value={filename}
              onChange={(event) => setFilename(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !exporting) void handleSubmit();
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <span>.{format}</span>
          </div>
        </label>

        <div className="export-summary">
          <div>
            <UiIcon name="folder-open" size={17} />
            <span>
              <strong>保存位置</strong>
              <small>{supportsSavePicker ? '导出时在系统窗口中选择' : '保存到浏览器默认下载目录'}</small>
            </span>
          </div>
          <div>
            <UiIcon name={privacyEnabledCount > 0 ? 'eye-off' : 'eye'} size={17} />
            <span>
              <strong>隐私处理</strong>
              <small>{privacyEnabledCount > 0 ? `已启用 ${privacyEnabledCount} 项脱敏` : '未启用脱敏，请确认内容可公开'}</small>
            </span>
          </div>
        </div>

        {error && <div className="export-dialog-error" role="alert">{error}</div>}

        <footer className="export-dialog-footer">
          <p>导出内容与当前预览、模板和模块顺序一致。</p>
          <div>
            <button type="button" className="toolbar-button ghost" onClick={onClose} disabled={exporting}>取消</button>
            <button type="button" className="toolbar-button primary export-confirm-button" onClick={() => void handleSubmit()} disabled={exporting}>
              <UiIcon name="download" size={16} />
              {exporting ? '正在生成…' : supportsSavePicker ? '选择位置并导出' : '导出到下载目录'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
