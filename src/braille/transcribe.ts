/**
 * 转写引擎：分词后的 token 序列 → 盲符（cell）序列。
 *
 * 每个输出盲符都带源码区间 [start, end)，因此：
 *  - 点盲符可反选原文区间；
 *  - 选原文字符可定位到覆盖它的全部盲符（大写号、数字号等前缀与本体一起被选中）。
 *
 * 模式切换是“结构性”的：数字号在每个连续数字串前发出，数字模式在遇到
 * 空格 / 标点 / 字母 token 时自然结束；大写号只修饰其后的字母（或词）。
 */

import {
  DIGIT_TO_LETTER,
  LETTER_DOTS,
  PUNCT_DOTS,
  SIGN_DOTS,
  WORD_CONTRACTIONS,
  type DotPattern,
} from './dots';
import type { RawToken } from './tokenize';

export type CellKind =
  | 'letter'
  | 'capital'
  | 'capsword'
  | 'number'
  | 'punct'
  | 'contraction'
  | 'space'
  | 'unsupported';

export interface BrailleCell {
  /** 一次转写内的稳定序号（也用于 React key） */
  seq: number;
  kind: CellKind;
  /** 点位；unsupported 为 null，space 为 [] */
  dots: DotPattern | null;
  /** 所属源文 token 的序号 */
  tokenIndex: number;
  /** 源文区间（左闭右开）；前缀号区间与其修饰对象相同 */
  start: number;
  end: number;
  /** 校对说明，如“完整词缩写 and” */
  note: string;
}

export interface TranscriptionResult {
  cells: BrailleCell[];
  unsupported: BrailleCell[];
  /** 被整词缩写命中的源文 token 序号 */
  contractedTokenIndexes: number[];
}

interface Builder {
  cells: BrailleCell[];
  contracted: number[];
  emit(
    kind: CellKind,
    dots: DotPattern | null,
    tokenIndex: number,
    start: number,
    end: number,
    note: string,
  ): void;
}

function newBuilder(): Builder {
  const cells: BrailleCell[] = [];
  return {
    cells,
    contracted: [],
    emit(kind, dots, tokenIndex, start, end, note) {
      cells.push({ seq: cells.length, kind, dots, tokenIndex, start, end, note });
    },
  };
}

type CapitalMode = 'lower' | 'first' | 'all';

function capitalModeOf(word: string): CapitalMode {
  if (word.length >= 2 && word === word.toUpperCase()) return 'all';
  if (/^[A-Z]/.test(word) && word.slice(1) === word.slice(1).toLowerCase()) return 'first';
  return 'lower';
}

export interface TranscribeOptions {
  /** 被逐词禁用缩写的 token 序号集合（校对时使用） */
  disabledTokens?: ReadonlySet<number>;
}

export function transcribe(tokens: RawToken[], opts: TranscribeOptions = {}): TranscriptionResult {
  const disabled = opts.disabledTokens ?? new Set<number>();
  const b = newBuilder();

  for (const tok of tokens) {
    switch (tok.kind) {
      case 'space': {
        // 词间空方：保留一个无点位占位，保证逐词映射与换行位置
        b.emit('space', [], tok.index, tok.start, tok.end, '空格（空方）');
        break;
      }

      case 'unsupported': {
        b.emit(
          'unsupported',
          null,
          tok.index,
          tok.start,
          tok.end,
          `未支持字符：${JSON.stringify(tok.text)}（已标出，未转写）`,
        );
        break;
      }

      case 'punct': {
        const dots = PUNCT_DOTS[tok.text];
        b.emit('punct', dots, tok.index, tok.start, tok.end, `标点 ${tok.text}`);
        break;
      }

      case 'number': {
        // 数字号：覆盖整串数字，点数字符时与所有数字一起被定位
        b.emit('number', SIGN_DOTS.number, tok.index, tok.start, tok.end, '数字号 ⠼（进入数字模式）');
        for (let p = 0; p < tok.text.length; p++) {
          const d = tok.text[p];
          const letter = DIGIT_TO_LETTER[d];
          b.emit(
            'letter',
            LETTER_DOTS[letter],
            tok.index,
            tok.start + p,
            tok.start + p + 1,
            `数字 ${d}（数字模式下借字母 ${letter} 的点位）`,
          );
        }
        break;
      }

      case 'word': {
        const lower = tok.text.toLowerCase();
        const contraction = WORD_CONTRACTIONS[lower];
        const canContract =
          contraction !== undefined && !disabled.has(tok.index) && /^[a-zA-Z]+$/.test(tok.text);

        if (canContract) {
          const mode = capitalModeOf(tok.text);
          if (mode === 'all') {
            b.emit('capsword', SIGN_DOTS.capsWord, tok.index, tok.start, tok.end, '全大写词号 ⠠⠠');
          } else if (mode === 'first') {
            b.emit('capital', SIGN_DOTS.capital, tok.index, tok.start, tok.end, '大写号 ⠠');
          }
          b.emit(
            'contraction',
            contraction,
            tok.index,
            tok.start,
            tok.end,
            `完整词缩写：整个单词 “${tok.text}” 缩写为一个点字（${lower}）`,
          );
          b.contracted.push(tok.index);
          break;
        }

        // 非缩写：逐字母输出；全大写词长 ≥2 时词首一个全大写词号，其余逐字母处理
        const mode = capitalModeOf(tok.text);
        if (mode === 'all') {
          b.emit('capsword', SIGN_DOTS.capsWord, tok.index, tok.start, tok.end, '全大写词号 ⠠⠠');
          for (let p = 0; p < tok.text.length; p++) {
            b.emit(
              'letter',
              LETTER_DOTS[lower[p]],
              tok.index,
              tok.start + p,
              tok.start + p + 1,
              `字母 ${tok.text[p]}（全大写词内）`,
            );
          }
        } else {
          for (let p = 0; p < tok.text.length; p++) {
            const ch = tok.text[p];
            if (ch >= 'A' && ch <= 'Z') {
              b.emit(
                'capital',
                SIGN_DOTS.capital,
                tok.index,
                tok.start + p,
                tok.start + p + 1,
                '大写号 ⠠',
              );
            }
            b.emit(
              'letter',
              LETTER_DOTS[lower[p]],
              tok.index,
              tok.start + p,
              tok.start + p + 1,
              `字母 ${ch}`,
            );
          }
        }
        break;
      }
    }
  }

  return {
    cells: b.cells,
    unsupported: b.cells.filter((c) => c.kind === 'unsupported'),
    contractedTokenIndexes: b.contracted,
  };
}
