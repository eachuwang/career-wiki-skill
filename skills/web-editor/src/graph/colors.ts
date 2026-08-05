const DARK_GRAPH_TEXT = '#17120f';
const LIGHT_GRAPH_TEXT = '#ffffff';

/** 把十六进制颜色转换为相对亮度，用于稳定计算文字对比度。 */
function getRelativeLuminance(hex: string): number {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  if (!channels || channels.length !== 3) return 0;

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** 按 WCAG 公式计算两种颜色的对比度。 */
export function getContrastRatio(first: string, second: string): number {
  const firstLuminance = getRelativeLuminance(first);
  const secondLuminance = getRelativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

/** 为实体色选择对比度更高的前景色，保证徽章文字清晰可读。 */
export function getReadableGraphTextColor(background: string): string {
  return getContrastRatio(background, DARK_GRAPH_TEXT) >=
    getContrastRatio(background, LIGHT_GRAPH_TEXT)
    ? DARK_GRAPH_TEXT
    : LIGHT_GRAPH_TEXT;
}
