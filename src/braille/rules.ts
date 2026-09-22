/**
 * 六点英文盲文教学子集 —— 规则表
 *
 * 点位编号约定（六点盲文国际通用）：
 *
 *      1 · · 4
 *      2 · · 5
 *      3 · · 6
 *
 * 本文件只定义“教学子集”明确支持的规则：
 *   - 26 个英文字母（小写）
 *   - 大写前缀 ⠠（点 6）：大写字母前一个，全大写词前两个
 *   - 数字前缀 ⠼（点 3456）：其后的 a–j 解释为 1–0，遇到非数字字母/空白即结束
 *   - 常用标点：句号、逗号、问号、感叹号、分号、冒号、撇号、连字符、引号、括号、斜杠
 *   - 五个完整词缩写：and ⠯ / for ⠿ / of ⠷ / the ⠹ / with ⠾
 *
 * 任何不在表内的字符都标记为 unsupported，绝不静默丢弃。
 */

/** 一个盲符 = 6 个点位的集合，用点位数字数组表示（升序、去重）。 */
export type Dots = readonly number[];

/** 点字单元的种类，决定它在界面上的呈现与解释。 */
export type CellKind =
  | 'letter' // 普通字母
  | 'number' // 数字 0–9（数字模式下复用 a–j 的字形）
  | 'capital' // 大写前缀 ⠠
  | 'numberSign' // 数字前缀 ⠼
  | 'punctuation' // 标点
  | 'contraction' // 完整词缩写
  | 'space' // 空格（空白点字 ⠀）
  | 'newline' // 换行（不是点字，仅用于排版对应）
  | 'unsupported'; // 未支持字符（保留原文，不丢弃）

export interface Cell {
  kind: CellKind;
  dots: Dots;
  /** 该点字在屏幕上显示的 Unicode 盲形（未支持字符显示 ⿽）。 */
  glyph: string;
  /** 该点字来自源文的字符区间 [start, end)，end 用绝对偏移。 */
  srcStart: number;
  srcEnd: number;
  /** 面向校对者的解释：这个点字是什么、为什么可以这样写。 */
  label: string;
  /** 当该单元是缩写时，记录缩写的词；否则为 undefined。 */
  contractionWord?: string;
  /** 未支持字符的原文（单个字符），用于界面标红展示。 */
  rawChar?: string;
  /** 这个点字本身是否只是一个“切换/前缀”符号（大写、数字前缀）。 */
  isPrefix?: boolean;
  /** 当该字母是某个“已被校对禁用缩写”的词按字母展开时，记录原缩写词。 */
  disabledWord?: string;
}

/** 把点位数组转成 Unicode Braille Patterns 字符（U+2800 起）。 */
export function dotsToGlyph(dots: Dots): string {
  let code = 0x2800;
  for (const d of dots) code |= 1 << (d - 1);
  return String.fromCodePoint(code);
}

/** 未支持字符使用的占位字形（U+2FFD 属于“描述用”字符，视觉上明显）。 */
export const UNSUPPORTED_GLYPH = '⿽';

/** 小写字母 -> 点位（标准英语盲文）。 */
export const LETTER_DOTS: Readonly<Record<string, Dots>> = {
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

/** 数字 0–9 复用的字母字形（数字模式下 a=1 … j=0）。 */
export const DIGIT_BY_LETTER: Readonly<Record<string, string>> = {
  a: '1', b: '2', c: '3', d: '4', e: '5',
  f: '6', g: '7', h: '8', i: '9', j: '0',
};

/** 数字（字符）-> 点位，与上面 a–j 相同。 */
export const DIGIT_DOTS: Readonly<Record<string, Dots>> = Object.fromEntries(
  Object.entries(DIGIT_BY_LETTER).map(([letter, digit]) => [digit, LETTER_DOTS[letter]]),
);

export const CAPITAL_DOTS: Dots = [6]; // ⠠
export const NUMBER_SIGN_DOTS: Dots = [3, 4, 5, 6]; // ⠼

/** 常用标点点位（传统英语盲文常用写法）。 */
export const PUNCTUATION_DOTS: Readonly<Record<string, Dots>> = {
  '.': [2, 5, 6], // ⠲ 句号
  ',': [2], // ⠂ 逗号
  '?': [2, 3, 6], // ⠦ 问号（与左双引号同形）
  '!': [2, 3, 5], // ⠖ 感叹号
  ';': [2, 3], // ⠆ 分号
  ':': [2, 5], // ⠒ 冒号
  "'": [3], // ⠄ 撇号
  '-': [3, 6], // ⠤ 连字符
  '/': [3, 4], // ⠌ 斜杠
  '"': [2, 3, 6], // 直引号：按相邻字符判定为左 ⠦（236）/右 ⠴（356）
  '“': [2, 3, 6], // ⠦ 左双引号
  '”': [3, 5, 6], // ⠴ 右双引号
  // 教学子集按传统英语盲文约定：左右括号同为 ⠶（2356），靠位置区分。
  '(': [2, 3, 5, 6], // ⠶ 左括号
  ')': [2, 3, 5, 6], // ⠶ 右括号
};

/** 五个完整词缩写：仅在整词边界命中。 */
export interface ContractRule {
  word: string;
  dots: Dots;
  reason: string;
}

export const CONTRACTIONS: readonly ContractRule[] = [
  { word: 'and', dots: [1, 2, 3, 4, 6], reason: '整词缩写：and 独立成词时用一个点字 ⠯（点 12346），不能命中 sandy 等词内部。' },
  { word: 'for', dots: [1, 2, 3, 4, 5, 6], reason: '整词缩写：for 独立成词时用一个点字 ⠿（点 123456）。' },
  { word: 'of', dots: [1, 2, 3, 5, 6], reason: '整词缩写：of 独立成词时用一个点字 ⠷（点 12356），不能命中 off/office 内部。' },
  { word: 'the', dots: [1, 4, 5, 6], reason: '整词缩写：the 独立成词时用一个点字 ⠹（点 1456），大写 The 在其前再加 ⠠。' },
  { word: 'with', dots: [2, 3, 4, 5, 6], reason: '整词缩写：with 独立成词时用一个点字 ⠾（点 23456）。' },
];

export const CAPITAL_GLYPH = dotsToGlyph(CAPITAL_DOTS);
export const NUMBER_SIGN_GLYPH = dotsToGlyph(NUMBER_SIGN_DOTS);
