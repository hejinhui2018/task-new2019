/**
 * 教学子集规则说明（供界面“规则与适用范围”面板直接渲染），
 * 同时是引擎行为的权威文字说明。
 */

import {
  LETTER_DOTS,
  PUNCT_DOTS,
  SIGN_DOTS,
  WORD_CONTRACTIONS,
  dotsToUnicode,
} from './dots';

export interface RuleSection {
  id: string;
  title: string;
  scope: string;
  items: { symbol: string; dots: string; explanation: string }[];
}

function fmt(dots: readonly number[]): string {
  return dots.length ? dots.join('-') : '空方';
}

export const RULE_SECTIONS: RuleSection[] = [
  {
    id: 'letters',
    title: '字母（26 个）',
    scope: '仅支持英文 A–Z / a–z；每个字母按标准六点字母表转写为一个点字。',
    items: Object.keys(LETTER_DOTS).map((ch) => ({
      symbol: ch,
      dots: fmt(LETTER_DOTS[ch]),
      explanation: `小写字母 ${ch}`,
    })),
  },
  {
    id: 'capitalization',
    title: '大小写',
    scope:
      '大写号 ⠠（6 点）置于字母前表示该字母大写；连续两个大写号 ⠠⠠ 表示其后整个单词全大写（词长至少 2 个字母时使用）。',
    items: [
      { symbol: dotsToUnicode(SIGN_DOTS.capital), dots: fmt(SIGN_DOTS.capital), explanation: '大写号：后随的一个字母大写' },
      { symbol: dotsToUnicode(SIGN_DOTS.capsWord), dots: '6, 6', explanation: '全大写词号：后随的整个单词全大写' },
    ],
  },
  {
    id: 'numbers',
    title: '数字模式',
    scope:
      '数字号 ⠼（3-4-5-6 点）之后进入数字模式，借 a–j 的点位表示 1–9、0；本教学子集中，数字模式在数字串结束处（遇到空格、标点或字母）即终止，下一串数字前重新发数字号。',
    items: [
      { symbol: dotsToUnicode(SIGN_DOTS.number), dots: fmt(SIGN_DOTS.number), explanation: '数字号：进入数字模式' },
      ...Object.entries({ a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8', i: '9', j: '0' }).map(
        ([letter, digit]) => ({
          symbol: digit,
          dots: fmt(LETTER_DOTS[letter]),
          explanation: `数字 ${digit}（数字模式下 = 字母 ${letter} 的点位）`,
        }),
      ),
    ],
  },
  {
    id: 'punctuation',
    title: '常用标点',
    scope: '仅支持下表标点；任何其他字符都会在两侧编辑区中以醒目的“未支持”标记保留，绝不静默丢弃。',
    items: Object.entries(PUNCT_DOTS)
      .filter(([ch]) => ch !== ' ')
      .map(([ch, dots]) => ({
        symbol: ch,
        dots: fmt(dots),
        explanation:
          ch === '"'
            ? '双引号：教学子集开闭引号统一用此符号（2-3-6）'
            : `标点 ${ch}`,
      })),
  },
  {
    id: 'contractions',
    title: '完整词缩写（5 个）',
    scope:
      '仅当字母串作为“完整单词”出现（两侧为空白、标点或起止）时才命中；单词内部字符不会被误吞（如 forest 不缩 for、theater 不缩 the）。可逐词禁用缩写以便校对；被禁用的词恢复为逐字母拼写。',
    items: Object.entries(WORD_CONTRACTIONS).map(([word, dots]) => ({
      symbol: word,
      dots: fmt(dots),
      explanation: `整个单词 ${word} → 一个点字（与字母 ${dotsToUnicode(dots)} 同点位）`,
    })),
  },
];

export const SUBSET_LIMITATIONS = [
  '只实现上述字母、大小写号、数字号、常用标点与 5 个完整词缩写；不含字母组合缩写（如 ⡹ tion、⠮ the 内用形）、短词形式词（en/in 等）与强/弱缩写。',
  '数字模式采用“每串数字前发数字号、串结束即退出”的简化规则；不处理数字内逗号/小数点连读、序数词与数字后紧跟字母的连写规则。',
  '双引号不区分开闭；不支持换行/换页符、着重号、连字号续行等排版规则。',
  '空白处理为词间空方，不做行宽折行算法。',
];
