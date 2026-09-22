/**
 * 源文分词：把原文切成 token 序列。
 *
 * token 类别：
 *  - word        纯字母词（大小写都算）
 *  - number      连续数字
 *  - space       连续空白（不产生盲符，用于词间隔与换行）
 *  - punct       教学子集支持的单个标点
 *  - unsupported  不支持的单个字符（必须显式标出，绝不静默丢弃）
 */

import { PUNCT_DOTS } from './dots';

export type TokenKind = 'word' | 'number' | 'space' | 'punct' | 'unsupported';

export interface RawToken {
  /** 本次分词内的序号 */
  index: number;
  kind: TokenKind;
  text: string;
  /** 相对源文的字符区间（左闭右开） */
  start: number;
  end: number;
}

const SUPPORTED_PUNCT = new Set(
  Object.keys(PUNCT_DOTS).filter((ch) => ch !== ' '),
);

export function tokenize(text: string): RawToken[] {
  const tokens: RawToken[] = [];
  let i = 0;
  const push = (kind: TokenKind, from: number, to: number) => {
    tokens.push({ index: tokens.length, kind, text: text.slice(from, to), start: from, end: to });
  };

  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      const start = i;
      while (i < text.length && /\s/.test(text[i])) i++;
      push('space', start, i);
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      const start = i;
      while (i < text.length && /[A-Za-z]/.test(text[i])) i++;
      push('word', start, i);
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < text.length && /[0-9]/.test(text[i])) i++;
      push('number', start, i);
      continue;
    }

    if (SUPPORTED_PUNCT.has(ch)) {
      push('punct', i, i + 1);
      i++;
      continue;
    }

    // 其他任何字符：逐字符标记为不支持
    push('unsupported', i, i + 1);
    i++;
  }

  return tokens;
}
