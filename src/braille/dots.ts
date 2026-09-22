/**
 * 六点盲文基础常量与字符表（英文六点盲文教学子集，EBAE 风格）。
 *
 * 点位编号约定（俯视点字，从左列上到下、再右列上到下）：
 *   1  4
 *   2  5
 *   3  6
 */

export const BRAILLE_DOTS = [1, 2, 3, 4, 5, 6] as const;
export type Dot = (typeof BRAILLE_DOTS)[number];

/** 用“有点的点位编号数组”表示一个盲符，如 [2,3,6] 表示问号 */
export type DotPattern = readonly Dot[];

/**
 * 小写字母 → 点位（无任何前缀号时的基础字母表）。
 */
export const LETTER_DOTS: Record<string, DotPattern> = {
  a: [1],
  b: [1, 2],
  c: [1, 4],
  d: [1, 4, 5],
  e: [1, 5],
  f: [1, 2, 4],
  g: [1, 2, 4, 5],
  h: [1, 2, 5],
  i: [2, 4],
  j: [2, 4, 5],
  k: [1, 3],
  l: [1, 2, 3],
  m: [1, 3, 4],
  n: [1, 3, 4, 5],
  o: [1, 3, 5],
  p: [1, 2, 3, 4],
  q: [1, 2, 3, 4, 5],
  r: [1, 2, 3, 5],
  s: [2, 3, 4],
  t: [2, 3, 4, 5],
  u: [1, 3, 6],
  v: [1, 2, 3, 6],
  w: [2, 4, 5, 6],
  x: [1, 3, 4, 6],
  y: [1, 3, 4, 5, 6],
  z: [1, 3, 5, 6],
};

/**
 * 数字模式下数字（及数字内标点）对应的“字母位”。
 * 数字号 ⠼ 之后按 a–j 序列表示 1–0：
 *   a1 b2 c3 d4 e5 f6 g7 h8 i9 j0
 */
export const DIGIT_TO_LETTER: Record<string, string> = {
  '1': 'a',
  '2': 'b',
  '3': 'c',
  '4': 'd',
  '5': 'e',
  '6': 'f',
  '7': 'g',
  '8': 'h',
  '9': 'i',
  '0': 'j',
};

/** 常用标点 → 点位（教学子集） */
export const PUNCT_DOTS: Record<string, DotPattern> = {
  ' ': [], // 空格本身不产生盲符（词间空就是物理空白），保留映射用于对齐
  ',': [2],
  ';': [2, 3],
  ':': [2, 5],
  '.': [2, 5, 6],
  '!': [2, 3, 5],
  '?': [2, 3, 6],
  "'": [3],
  '-': [3, 6],
  '(': [1, 2, 3, 5, 6],
  ')': [2, 3, 4, 5, 6],
  '/': [3, 4],
  '"': [2, 3, 6], // 开闭双引号在教学子集中统一用同一符号表示
};

/** 前缀/模式号 */
export const SIGN_DOTS = {
  /** 大写号（字母大写前缀）dots 6 */
  capital: [6] as DotPattern,
  /** 全大写词号 dots 6-6 */
  capsWord: [6, 6] as DotPattern,
  /** 数字号 dots 3-4-5-6 */
  number: [3, 4, 5, 6] as DotPattern,
};

/** 五个“完整词缩写”（whole-word contractions）：原文小写词 → 点位（与某字母共用点位） */
export const WORD_CONTRACTIONS: Record<string, DotPattern> = {
  and: [1, 2, 3, 4], // p
  for: [1, 2, 3, 4, 5], // q
  of: [1, 2, 3, 5], // r
  the: [2, 3, 4, 5], // t
  with: [2, 4, 5, 6], // w
};

/** 把点位数组转成 Unicode 盲文字符（便于直观阅读） */
export function dotsToUnicode(dots: DotPattern): string {
  let code = 0x2800;
  for (const d of dots) code |= 1 << (d - 1);
  return String.fromCharCode(code);
}
