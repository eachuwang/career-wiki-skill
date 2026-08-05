/**
 * UiIcon — 编辑器统一线性图标层。
 *
 * 基于 Phosphor 图标库渲染，避免手写 SVG；
 * 组件内部统一设置尺寸与无障碍属性。
 */

import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  Article,
  Book,
  Briefcase,
  CaretDown,
  CaretRight,
  Certificate,
  ChartBar,
  Code,
  Download,
  DotsSixVertical,
  Envelope,
  Eye,
  EyeSlash,
  File,
  FloppyDisk,
  Folder,
  GithubLogo,
  Globe,
  GraduationCap,
  Graph,
  Lightning,
  Medal,
  Minus,
  Phone,
  Plus,
  Sparkle,
  Trash,
  User,
  X,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
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
  | 'close'
  | 'code'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'file'
  | 'graph'
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

const ICONS: Record<UiIconName, Icon> = {
  person: User,
  experience: Briefcase,
  project: Folder,
  skill: Lightning,
  education: GraduationCap,
  certificate: Certificate,
  award: Medal,
  publication: Article,
  activity: ChartBar,
  summary: Sparkle,
  'arrow-down': ArrowDown,
  'arrow-up': ArrowUp,
  book: Book,
  'chevron-down': CaretDown,
  'chevron-right': CaretRight,
  close: X,
  code: Code,
  download: Download,
  eye: Eye,
  'eye-off': EyeSlash,
  file: File,
  graph: Graph,
  grip: DotsSixVertical,
  minus: Minus,
  plus: Plus,
  refresh: ArrowClockwise,
  save: FloppyDisk,
  trash: Trash,
  mail: Envelope,
  phone: Phone,
  github: GithubLogo,
  globe: Globe,
};

/** 渲染装饰性图标，交互含义统一由按钮的 aria-label 提供。 */
export default function UiIcon({ name, size = 20, ...props }: UiIconProps) {
  const IconComponent = ICONS[name];
  return (
    <IconComponent
      size={size}
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}
