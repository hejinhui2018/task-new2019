import { describe, expect, it } from 'vitest';
import { tokenize } from '../braille/tokenize';
import { transcribe } from '../braille/transcribe';
import { LETTER_DOTS, SIGN_DOTS, WORD_CONTRACTIONS, dotsToUnicode } from '../braille/dots';

function transcribeText(text: string, disabledTokens?: ReadonlySet<number>) {
  return transcribe(tokenize(text), { disabledTokens });
}

function kindsFor(text: string) {
  return transcribeText(text).cells.map((c) => c.kind);
}

describe('字母与大小写模式', () => {
  it('小写字母逐字母转写', () => {
    const r = transcribeText('abc');
    expect(r.cells).toHaveLength(3);
    expect(r.cells.map((c) => c.dots)).toEqual([
      LETTER_DOTS.a,
      LETTER_DOTS.b,
      LETTER_DOTS.c,
    ]);
    expect(r.cells.map((c) => [c.start, c.end])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('单个大写字母：大写号(6) + 字母点字，且两者映射到同一源文区间', () => {
    const r = transcribeText('A');
    expect(r.cells).toHaveLength(2);
    expect(r.cells[0].kind).toBe('capital');
    expect(r.cells[0].dots).toEqual(SIGN_DOTS.capital);
    expect(r.cells[0].start).toBe(0);
    expect(r.cells[0].end).toBe(1);
    expect(r.cells[1].kind).toBe('letter');
    expect(r.cells[1].start).toBe(0);
    expect(r.cells[1].end).toBe(1);
  });

  it('Title 大小写词：仅词首一个大写号', () => {
    const r = transcribeText('Cat');
    // capital + c + a + t（Cat 不是缩写词）
    expect(r.cells.map((c) => c.kind)).toEqual(['capital', 'letter', 'letter', 'letter']);
    expect(r.cells[0].start).toBe(0);
    expect(r.cells[0].end).toBe(1); // 单个大写号只覆盖首字母
  });

  it('全大写词：全大写词号(6,6) + 逐字母，不再为每字母加大写号', () => {
    const r = transcribeText('BBC');
    expect(r.cells[0].kind).toBe('capsword');
    expect(r.cells[0].dots).toEqual([6, 6]);
    expect(r.cells.slice(1).map((c) => c.kind)).toEqual(['letter', 'letter', 'letter']);
  });

  it('单字母大写词只用单个大写号', () => {
    const r = transcribeText('I');
    expect(r.cells.map((c) => c.kind)).toEqual(['capital', 'letter']);
  });
});

describe('数字模式切换', () => {
  it('数字串前发数字号，串结束（空格）退出，下一串重新发数字号', () => {
    const r = transcribeText('12 34');
    expect(r.cells.map((c) => c.kind)).toEqual([
      'number',
      'letter',
      'letter',
      'space',
      'number',
      'letter',
      'letter',
    ]);
  });

  it('四位年份：数字号 + 4 个数字位，数字借用 a–j 点位', () => {
    const r = transcribeText('2024');
    expect(r.cells).toHaveLength(5);
    expect(r.cells[0].dots).toEqual(SIGN_DOTS.number);
    expect(r.cells.slice(1).map((c) => c.dots)).toEqual([
      LETTER_DOTS.b, // 2
      LETTER_DOTS.j, // 0
      LETTER_DOTS.b, // 2
      LETTER_DOTS.d, // 4
    ]);
    // 数字号映射覆盖整串
    expect([r.cells[0].start, r.cells[0].end]).toEqual([0, 4]);
    // 每个数字位映射到单个源文字符
    expect(r.cells.slice(1).map((c) => [c.start, c.end])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });

  it('数字与标点相邻时数字模式自然结束', () => {
    const r = transcribeText('2024.');
    expect(r.cells.map((c) => c.kind)).toEqual([
      'number',
      'letter',
      'letter',
      'letter',
      'letter',
      'punct',
    ]);
  });

  it('数字后直接跟字母时数字模式结束，字母正常拼写', () => {
    const r = transcribeText('1st');
    expect(r.cells.map((c) => c.kind)).toEqual([
      'number',
      'letter', // 1
      'letter', // s
      'letter', // t
    ]);
  });
});

describe('完整词缩写', () => {
  it('五个缩写词全部命中为一个点字', () => {
    for (const word of ['and', 'for', 'of', 'the', 'with']) {
      const r = transcribeText(word);
      const contracted = r.cells.filter((c) => c.kind === 'contraction');
      expect(contracted).toHaveLength(1);
      expect(contracted[0].dots).toEqual(WORD_CONTRACTIONS[word]);
      expect([contracted[0].start, contracted[0].end]).toEqual([0, word.length]);
      expect(r.contractedTokenIndexes).toHaveLength(1);
    }
  });

  it('缩写只命中完整词，不吞单词内部字符', () => {
    // forest 含 for、theater 含 the、sand 含 and、offer 含 of、without 含 with
    for (const word of ['forest', 'theater', 'sand', 'offer', 'without']) {
      const r = transcribeText(word);
      expect(r.contractedTokenIndexes).toHaveLength(0);
      expect(r.cells.every((c) => c.kind !== 'contraction')).toBe(true);
      // 全部逐字母输出
      expect(r.cells.filter((c) => c.kind === 'letter')).toHaveLength(word.length);
    }
  });

  it('缩写词带句末标点时仍命中（标点是词边界）', () => {
    const r = transcribeText('the.');
    expect(r.cells.map((c) => c.kind)).toEqual(['contraction', 'punct']);
  });

  it('The 首字母大写仍按整词缩写命中', () => {
    const r = transcribeText('The');
    expect(r.cells.map((c) => c.kind)).toEqual(['capital', 'contraction']);
    expect(r.contractedTokenIndexes).toHaveLength(1);
  });

  it('全大写缩写词：全大写词号 + 缩写点字', () => {
    const r = transcribeText('AND');
    expect(r.cells.map((c) => c.kind)).toEqual(['capsword', 'contraction']);
  });

  it('可逐词禁用缩写：禁用后恢复逐字母，其他词不受影响', () => {
    const tokens = tokenize('and the');
    // tokens: and(0), space(1), the(2)
    const r = transcribe(tokens, { disabledTokens: new Set([0]) });
    const kinds = r.cells.map((c) => c.kind).filter((k) => k !== 'space');
    expect(kinds).toEqual(['letter', 'letter', 'letter', 'contraction']);
  });

  it('禁用后重新启用恢复缩写', () => {
    const tokens = tokenize('the');
    const disabled = transcribe(tokens, { disabledTokens: new Set([0]) });
    expect(disabled.contractedTokenIndexes).toHaveLength(0);
    const enabled = transcribe(tokens);
    expect(enabled.contractedTokenIndexes).toEqual([0]);
  });
});

describe('标点与未支持字符', () => {
  it('常用标点正确转写', () => {
    const r = transcribeText('?');
    expect(r.cells[0].kind).toBe('punct');
    expect(r.cells[0].dots).toEqual([2, 3, 6]);
    expect(dotsToUnicode([2, 3, 6])).toBe('⠦');
  });

  it('未支持字符显式标记为 unsupported 且保留源文位置，绝不丢弃', () => {
    const r = transcribeText('a#b');
    expect(r.unsupported).toHaveLength(1);
    const u = r.unsupported[0];
    expect(u.dots).toBeNull();
    expect([u.start, u.end]).toEqual([1, 2]);
    // 前后字符都还在
    expect(r.cells.filter((c) => c.kind === 'letter')).toHaveLength(2);
    const kinds = r.cells.map((c) => c.kind);
    expect(kinds).toEqual(['letter', 'unsupported', 'letter']);
  });

  it('空格产生 space 占位以维持词对齐', () => {
    expect(kindsFor('a b')).toEqual(['letter', 'space', 'letter']);
  });
});

describe('双向映射覆盖', () => {
  it('一个词一个点字：缩写点字覆盖整词区间', () => {
    const r = transcribeText('with');
    const c = r.cells.find((c) => c.kind === 'contraction')!;
    expect(r.cells.filter((x) => x.start >= 0 && x.end <= 4)).toContain(c);
    expect(c.start).toBe(0);
    expect(c.end).toBe(4);
  });

  it('一个字母多个点字：大写 A 对应两个盲符，都能被同一区间反查到', () => {
    const r = transcribeText('A');
    const covering = r.cells.filter((c) => c.start < 1 && c.end > 0 && c.kind !== 'space');
    expect(covering).toHaveLength(2);
  });

  it('内置示例中转写单元总数与源码覆盖一致（无遗漏、无越界）', textCoverageCheck);
});

function textCoverageCheck() {
  const text = 'The BBC and 2024.';
  const r = transcribeText(text);
  // 每个非空白源文字符至少被一个非 space、非 unsupported 单元覆盖（unsupported 自覆盖）
  for (let i = 0; i < text.length; i++) {
    const covers = r.cells.filter((c) => c.start <= i && i < c.end);
    expect(covers.length, `字符 ${i} (${text[i]}) 无映射`).toBeGreaterThan(0);
  }
}
