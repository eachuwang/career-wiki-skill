/**
 * UiIcon — 编辑器统一线性图标。
 * 内置 SVG 可避免为少量图标增加依赖，并保证尺寸、描边和无障碍行为一致。
 */

import type { SVGProps } from 'react';
import type { ResumeContactIcon } from '../resume/contact';
import type { EntityType } from '../types';

export type UiIconName =
  | EntityType
  | ResumeContactIcon
  | 'arrow-down'
  | 'arrow-up'
  | 'book'
  | 'chevron-down'
  | 'chevron-right'
  | 'code'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'file'
  | 'grip'
  | 'minus'
  | 'plus'
  | 'refresh'
  | 'save'
  | 'trash';

interface UiIconProps extends SVGProps<SVGSVGElement> {
  name: UiIconName;
  size?: number;
}

const PATHS: Record<UiIconName, JSX.Element> = {
  person: <><circle cx="12" cy="8" r="3" /><path d="M5 20c.8-4 3.1-6 7-6s6.2 2 7 6" /></>,
  experience: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5h8v2M3 12h18M10 12v2h4v-2" /></>,
  project: <><path d="M3 7h7l2 2h9v10H3z" /><path d="M3 7V5h7l2 2" /></>,
  skill: <path d="m13 2-8 12h7l-1 8 8-12h-7z" />,
  education: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11v5c3 2 9 2 12 0v-5M22 9v6" /></>,
  certificate: <><rect x="4" y="3" width="16" height="14" rx="2" /><path d="M8 7h8M8 11h5M9 17l-1 5 4-2 4 2-1-5" /></>,
  award: <><circle cx="12" cy="9" r="5" /><path d="m9 14-2 8 5-3 5 3-2-8M10 9l1.3 1.3L14 7.8" /></>,
  publication: <><path d="M5 3h11l3 3v15H5z" /><path d="M15 3v4h4M8 11h8M8 15h8" /></>,
  activity: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
  summary: <><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  'arrow-down': <path d="M12 5v14m-5-5 5 5 5-5" />,
  'arrow-up': <path d="M12 19V5m-5 5 5-5 5 5" />,
  book: <><path d="M4 4h6a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H4z" /><path d="M20 4h-6a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h6z" /></>,
  'chevron-down': <path d="m7 9 5 5 5-5" />,
  'chevron-right': <path d="m9 7 5 5-5 5" />,
  code: <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" /></>,
  download: <><path d="M12 3v12m-4-4 4 4 4-4" /><path d="M5 19h14" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12" /><circle cx="12" cy="12" r="2.5" /></>,
  'eye-off': <><path d="m3 3 18 18M10.5 6.2Q11.2 6 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.2 3.7M6.2 6.3A16 16 0 0 0 2 12s3.5 6 10 6c1 0 2-.2 2.8-.5" /></>,
  file: <><path d="M6 3h9l3 3v15H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></>,
  grip: <><circle cx="9" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  phone: <path d="M7 3H4.5A1.5 1.5 0 0 0 3 4.5C3 13.6 10.4 21 19.5 21a1.5 1.5 0 0 0 1.5-1.5V17l-4-1-1.2 2.2a15.7 15.7 0 0 1-10-10L8 7z" />,
  github: <><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.7-1.6 6.7-7A5.4 5.4 0 0 0 19.2 4 5.1 5.1 0 0 0 19.1.5 7.8 7.8 0 0 0 15 2a13.4 13.4 0 0 0-7 0A7.8 7.8 0 0 0 3.9.5 5.1 5.1 0 0 0 3.8 4a5.4 5.4 0 0 0-1.5 3.5c0 5.4 3.4 6.6 6.7 7A4.8 4.8 0 0 0 8 18v4" /><path d="M8 19c-3 .9-3-1.5-4-2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  minus: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5M6.1 8a7 7 0 0 1 11.7-2L20 8M4 16l2.2 2a7 7 0 0 0 11.7-2" /></>,
  save: <><path d="M4 3h14l2 2v16H4z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
};

/** 渲染装饰性 SVG，交互含义统一由按钮的 aria-label 提供。 */
export default function UiIcon({ name, size = 20, ...props }: UiIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
