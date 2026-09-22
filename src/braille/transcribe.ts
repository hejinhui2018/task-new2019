/**
 * 转写引擎：源文 -> 点字单元序列（带源码区间），以及反向映射。
 *
 * 设计要点（对应教学子集要求）：
 *  1. 缩写只在“整词”边界命中。边界 = 前后都不是字母或数字，
 *     因此 sandy 内部的 and、office 内部的 of 都不会被吞掉。
 *  2. 数字模式：遇到数字先放 ⠼，之后连续的 a–j 字形按 1–0 解释；
 *     一旦遇到非数字字符（字母/空白/标点）数字模式即结束；
 *     若后面再次出现数字，会重新放 ⠼。年份 2024 即 ⠼⠃⠚⠃⠙。
 *  3. 大小写：大写字母前放一个 ⠠；连续大写（整词全大写）开头放两个 ⠠。
 *  4. 每个点字单元都带 srcStart/srcEnd，前缀单元长度为 0，
 *     锚定在它修饰的字符位置上 —— 这是“一个词变一个点字”
 *     和“一个字母变多个点字”都能准确定位的基础。
 *  5. 未支持字符生成 unsupported 单元（保留原字符），绝不丢弃。
 */

import {
  CAPITAL_DOTS,
  CAPITAL_GLYPH,
  Cell,
  CONTRACTIONS,
  DIGIT_DOTS,
  LETTER_DOTS,
  NUMBER_SIGN_DOTS,
  NUMBER_SIGN_GLYPH,
  PUNCTUATION_DOTS,
  UNSUPPORTED_GLYPH,
  dotsToGlyph,
} from './rules';

const isLetter = (ch: string | undefined): boolean =>
  !!ch && /[A-Za-z]/.test(ch);
const isDigit = (ch: string | undefined): boolean =>
  !!ch && ch >= '0' && ch <= '9';
/** 词字符：字母或数字。缩写的整词边界按它判定。 */
const isWordChar = (ch: string | undefined): boolean =>
  isLetter(ch) || isDigit(ch);

/** 被校对者逐词禁用的缩写：key 为词在源文中的起始偏移。 */
export type DisabledContractions = ReadonlySet<number>;

export interface TranscribeOptions {
  /** 被禁用的缩写词起始偏移集合。 */
  disabledAt?: DisabledContractions;
}

/** 缩写词 -> 规则。 */
const CONTRACT_MAP: ReadonlyMap<string, { dots: readonly number[]; reason: string }> = new Map(
  CONTRACTIONS.map((c) => [c.word, c]),
);

/**
 * 若 pos 处是一个落在整词边界上的缩写词，返回该词信息；否则 null。
 * UI 与转写引擎共用，保证“什么词能缩写”的判定只有一处。
 */
export function matchContraction(
  text: string,
  pos: number,
): { word: string; start: number; end: number } | null {
  if (!isLetter(text[pos])) return null;
  let end = pos;
  while (end < text.length && isLetter(text[end])) end++;
  const prev = text[pos - 1];
  const next = text[end];
  if (isWordChar(prev) || isWordChar(next)) return null;
  const lower = text.slice(pos, end).toLowerCase();
  if (!CONTRACT_MAP.has(lower)) return null;
  return { word: lower, start: pos, end };
}

export interface TranscribeResult {
  cells: Cell[];
  /** 未支持字符在源文中的偏移列表（方便状态栏统计）。 */
  unsupportedOffsets: number[];
}

/** 判断 pos 处开始的字母序列是否为“全大写词”（长度 >= 2 且全为大写字母）。 */
function allCapsRun(text: string, pos: number): number {
  let end = pos;
  while (end < text.length && /[A-Z]/.test(text[end])) end++;
  return end - pos >= 2 ? end : pos;
}

export function transcribe(text: string, options: TranscribeOptions = {}): TranscribeResult {
  const disabled = options.disabledAt ?? new Set<number>();
  const cells: Cell[] = [];
  const unsupportedOffsets: number[] = [];

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // ---- 空白 ----
    if (ch === ' ') {
      cells.push({
        kind: 'space',
        dots: [],
        glyph: ' ',
        srcStart: i,
        srcEnd: i + 1,
        label: '空格',
      });
      i++;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      const step = ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      cells.push({
        kind: 'newline',
        dots: [],
        glyph: '\n',
        srcStart: i,
        srcEnd: i + step,
        label: '换行',
      });
      i += step;
      continue;
    }
    if (ch === '\t') {
      cells.push({
        kind: 'space',
        dots: [],
        glyph: '    ',
        srcStart: i,
        srcEnd: i + 1,
        label: '制表符按空格处理',
      });
      i++;
      continue;
    }

    // ---- 数字模式 ----
    if (isDigit(ch)) {
      const numStart = i;
      cells.push({
        kind: 'numberSign',
        dots: NUMBER_SIGN_DOTS,
        glyph: NUMBER_SIGN_GLYPH,
        srcStart: numStart,
        srcEnd: numStart, // 前缀：零宽度锚定在首个数字上
        isPrefix: true,
        label: '数字前缀 ⠼：其后的 a–j 字形按 1–0 解释，遇非数字即结束。',
      });
      while (i < text.length && isDigit(text[i])) {
        cells.push({
          kind: 'number',
          dots: DIGIT_DOTS[text[i]],
          glyph: dotsToGlyph(DIGIT_DOTS[text[i]]),
          srcStart: i,
          srcEnd: i + 1,
          label: `数字 ${text[i]}（数字模式下复用字母 ${digitLetter(text[i])} 的点位）`,
        });
        i++;
      }
      continue;
    }

    // ---- 字母词：先试整词缩写，再逐字母（含大小写前缀） ----
    if (isLetter(ch)) {
      const match = matchContraction(text, i);
      const wordStart = i;
      const wordEnd = match ? match.end : (() => {
        let e = i;
        while (e < text.length && isLetter(text[e])) e++;
        return e;
      })();
      const word = text.slice(wordStart, wordEnd);
      const lower = match ? match.word : word.toLowerCase();

      const useContraction = !!match && !disabled.has(wordStart);

      if (match && useContraction) {
        const rule = CONTRACT_MAP.get(lower)!;
        // 大写：The 之类首字母大写加一个 ⠠；THE 全大写加两个 ⠠。
        emitCapitals(cells, text, wordStart, wordEnd);
        cells.push({
          kind: 'contraction',
          dots: rule.dots,
          glyph: dotsToGlyph(rule.dots),
          srcStart: wordStart,
          srcEnd: wordEnd,
          label: `整词缩写 “${word}” -> 一个点字 ${dotsToGlyph(rule.dots)}。${rule.reason}`,
          contractionWord: lower,
        });
        i = wordEnd;
        continue;
      }

      // 普通字母序列；逐个处理大写前缀。
      let p = wordStart;
      while (p < wordEnd) {
        const c = text[p];
        const isUpper = c >= 'A' && c <= 'Z';
        if (isUpper) {
          const capsEnd = allCapsRun(text, p);
          if (capsEnd > p) {
            // 全大写词：两个 ⠠，都锚定在首字母（零宽度）。
            cells.push({
              kind: 'capital',
              dots: CAPITAL_DOTS,
              glyph: CAPITAL_GLYPH,
              srcStart: p,
              srcEnd: p,
              isPrefix: true,
              label: '大写前缀 ⠠（第 1 个）：与下一个 ⠠ 连用，表示其后整个词全大写。',
            });
            cells.push({
              kind: 'capital',
              dots: CAPITAL_DOTS,
              glyph: CAPITAL_GLYPH,
              srcStart: p,
              srcEnd: p,
              isPrefix: true,
              label: '大写前缀 ⠠（第 2 个）：双 ⠠ 表示整词大写，结束于非大写字母。',
            });
          } else {
            cells.push({
              kind: 'capital',
              dots: CAPITAL_DOTS,
              glyph: CAPITAL_GLYPH,
              srcStart: p,
              srcEnd: p,
              isPrefix: true,
              label: `大写前缀 ⠠：其后一个字母 ${c.toLowerCase()} 大写。`,
            });
          }
        }
        const lowerC = c.toLowerCase();
        const dots = LETTER_DOTS[lowerC];
        cells.push({
          kind: 'letter',
          dots,
          glyph: dotsToGlyph(dots),
          srcStart: p,
          srcEnd: p + 1,
          label: `字母 ${c} -> ${dotsToGlyph(dots)}（点 ${dots.join('')}）${
            isUpper ? '，与前面的 ⠠ 组合成大写。' : ''
          }`,
          disabledWord: match ? lower : undefined,
        });
        p++;
      }
      if (match && !useContraction) {
        // 被禁用的缩写：已按逐字母展开，在首字母解释里注明。
        for (const c of cells) {
          if (c.disabledWord === lower) {
            c.label += `（校对已禁用 ${lower} 的整词缩写，按字母逐个书写。）`;
            break;
          }
        }
      }
      i = wordEnd;
      continue;
    }

    // ---- 标点 ----
    if (Object.prototype.hasOwnProperty.call(PUNCTUATION_DOTS, ch)) {
      const dots = punctuationFor(ch, text, i);
      cells.push({
        kind: 'punctuation',
        dots,
        glyph: dotsToGlyph(dots),
        srcStart: i,
        srcEnd: i + 1,
        label: punctuationLabel(ch, dots),
      });
      i++;
      continue;
    }

    // ---- 未支持字符：保留并标出 ----
    cells.push({
      kind: 'unsupported',
      dots: [],
      glyph: UNSUPPORTED_GLYPH,
      srcStart: i,
      srcEnd: i + 1,
      rawChar: ch,
      label: `未支持字符 “${ch}”（U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}）：教学子集未收录，已原样标出而非丢弃。`,
    });
    unsupportedOffsets.push(i);
    i++;
  }

  return { cells, unsupportedOffsets };
}

/** 缩写命中且词含大写时，输出对应的大写前缀（The -> ⠠⠹, THE -> ⠠⠠⠹）。 */
function emitCapitals(cells: Cell[], text: string, start: number, end: number): void {
  if (end - start < 1) return;
  const first = text[start];
  if (!(first >= 'A' && first <= 'Z')) return;
  let allUpper = true;
  for (let p = start; p < end; p++) {
    if (!(text[p] >= 'A' && text[p] <= 'Z')) allUpper = false;
  }
  cells.push({
    kind: 'capital',
    dots: CAPITAL_DOTS,
    glyph: CAPITAL_GLYPH,
    srcStart: start,
    srcEnd: start,
    isPrefix: true,
    label: allUpper
      ? '大写前缀 ⠠（第 1 个）：双 ⠠ 与缩写点字连用，表示缩写词全大写。'
      : `大写前缀 ⠠：缩写词 ${text.slice(start, end)} 首字母大写。`,
  });
  if (allUpper && end - start >= 2) {
    cells.push({
      kind: 'capital',
      dots: CAPITAL_DOTS,
      glyph: CAPITAL_GLYPH,
      srcStart: start,
      srcEnd: start,
      isPrefix: true,
      label: '大写前缀 ⠠（第 2 个）：缩写词整词全大写。',
    });
  }
}

function digitLetter(digit: string): string {
  return 'abcdefghij'[Number(digit)];
}

/** 直引号按其前后字符推断左右：左侧为空白/起始/左括号视为左引号。 */
function punctuationFor(ch: string, text: string, pos: number): readonly number[] {
  if (ch !== '"') return PUNCTUATION_DOTS[ch];
  const prev = text[pos - 1];
  const isOpening = prev === undefined || prev === ' ' || prev === '\n' || prev === '(';
  return isOpening ? PUNCTUATION_DOTS['“'] : PUNCTUATION_DOTS['”'];
}

function punctuationLabel(ch: string, dots: readonly number[]): string {
  const names: Record<string, string> = {
    '.': '句号', ',': '逗号', '?': '问号', '!': '感叹号', ';': '分号', ':': '冒号',
    "'": '撇号', '-': '连字符', '/': '斜杠', '"': '引号', '“': '左双引号', '”': '右双引号',
    '(': '左括号', ')': '右括号',
  };
  const name = names[ch] ?? '标点';
  let note = '';
  if (ch === ')') note = '（教学子集约定左右括号同形 ⠶，靠位置区分）';
  if (ch === '?') note = '（与左双引号同形，靠上下文区分）';
  return `${name} “${ch}” -> ${dotsToGlyph(dots)}（点 ${dots.join('')}）${note}`;
}

// ---------------------------------------------------------------------------
// 反向映射：源码偏移 -> 点字单元下标区间；点字下标 -> 源码区间
// ---------------------------------------------------------------------------

export interface SourceRange {
  start: number;
  end: number;
}

/** 返回覆盖源文 [start, end) 的所有点字单元下标（含零宽度前缀）。 */
export function cellsCoveringRange(cells: readonly Cell[], start: number, end: number): number[] {
  const out: number[] = [];
  for (let idx = 0; idx < cells.length; idx++) {
    const c = cells[idx];
    if (start === end) {
      // 光标（无选区）：前缀锚点精确命中，或普通单元包含该偏移。
      if (c.srcStart === c.srcEnd) {
        if (c.srcStart === start) out.push(idx);
      } else if (c.srcStart <= start && c.srcEnd > start) {
        out.push(idx);
      }
      continue;
    }
    // 选区：前缀落在 [start, end) 内（end 处的前缀属于下一个词，排除）。
    if (c.srcStart === c.srcEnd) {
      if (c.srcStart >= start && c.srcStart < end) out.push(idx);
    } else if (c.srcStart < end && c.srcEnd > start) {
      out.push(idx);
    }
  }
  return out;
}

/** 点字单元下标 -> 它所对应的源文区间（零宽度前缀返回它锚定的那个字符）。 */
export function cellSourceRange(cell: Cell): SourceRange {
  if (cell.srcStart === cell.srcEnd) {
    return { start: cell.srcStart, end: cell.srcStart + 1 };
  }
  return { start: cell.srcStart, end: cell.srcEnd };
}
