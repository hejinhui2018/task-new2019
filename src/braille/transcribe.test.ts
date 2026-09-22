import { describe, expect, it } from 'vitest';
import {
  CAPITAL_GLYPH,
  CONTRACTIONS,
  LETTER_DOTS,
  NUMBER_SIGN_GLYPH,
  UNSUPPORTED_GLYPH,
  dotsToGlyph,
} from './rules';
import { cellSourceRange, cellsCoveringRange, matchContraction, transcribe } from './transcribe';
import { resolveAnchor } from './anchors';

const glyphs = (s: string, disabled?: Set<number>) =>
  transcribe(s, { disabledAt: disabled }).cells
    .filter((c) => c.kind !== 'space' && c.kind !== 'newline')
    .map((c) => c.glyph)
    .join('');

describe('字母与大小写', () => {
  it('小写字母逐字转写', () => {
    const r = transcribe('abc');
    expect(r.cells.map((c) => c.glyph).join('')).toBe('⠁⠃⠉');
    expect(r.unsupportedOffsets).toEqual([]);
  });

  it('单个大写字母前加一个 ⠠，且前缀锚定在该字母', () => {
    const r = transcribe('A');
    expect(r.cells.map((c) => c.kind)).toEqual(['capital', 'letter']);
    expect(r.cells.map((c) => c.glyph).join('')).toBe(CAPITAL_GLYPH + '⠁');
    expect(r.cells[0].srcStart).toBe(0);
    expect(r.cells[0].srcEnd).toBe(0); // 零宽度前缀
    expect(r.cells[1].srcStart).toBe(0);
  });

  it('全大写词前加两个 ⠠（双大写），普通首字母大写只加一个', () => {
    const r = transcribe('THE');
    const caps = r.cells.filter((c) => c.kind === 'capital');
    expect(caps).toHaveLength(2);
    const r2 = transcribe('The');
    expect(r2.cells.filter((c) => c.kind === 'capital')).toHaveLength(1);
  });

  it('大小写相邻切换正确：aBc', () => {
    const r = transcribe('aBc');
    expect(r.cells.filter((c) => c.kind === 'capital')).toHaveLength(1);
    expect(r.cells.map((c) => c.glyph).join('')).toBe('⠁' + CAPITAL_GLYPH + '⠃⠉');
  });
});

describe('数字模式', () => {
  it('年份 2024 = 数字前缀 + b/j/b/d', () => {
    const r = transcribe('2024');
    expect(r.cells[0].kind).toBe('numberSign');
    expect(r.cells.map((c) => c.glyph).join('')).toBe(
      NUMBER_SIGN_GLYPH +
        dotsToGlyph(LETTER_DOTS.b) +
        dotsToGlyph(LETTER_DOTS.j) +
        dotsToGlyph(LETTER_DOTS.b) +
        dotsToGlyph(LETTER_DOTS.d),
    );
  });

  it('数字遇空格结束，之后再次出现数字重新加前缀', () => {
    const r = transcribe('1 a 2');
    expect(r.cells.filter((c) => c.kind === 'numberSign')).toHaveLength(2);
  });

  it('数字遇标点结束：2024, 中逗号后数字模式已退出', () => {
    const r = transcribe('2024, x');
    const kinds = r.cells.map((c) => c.kind);
    const comma = kinds.indexOf('punctuation');
    // 逗号之后若再出现字母，不应带数字前缀
    expect(kinds.slice(comma + 1)).toContain('letter');
    expect(kinds.slice(comma + 1)).not.toContain('numberSign');
  });

  it('数字 0 复用 j 的点位', () => {
    const r = transcribe('0');
    expect(r.cells[1].dots).toEqual(LETTER_DOTS.j);
  });
});

describe('标点', () => {
  it('常用标点全部可转写', () => {
    const r = transcribe('.,?!;:\'-/"()"');
    const unsupported = r.cells.filter((c) => c.kind === 'unsupported');
    expect(unsupported).toHaveLength(0);
  });

  it('标点与数字、字母相邻不错位', () => {
    const r = transcribe('a, 1.');
    const kinds = r.cells.map((c) => c.kind);
    expect(kinds).toEqual([
      'letter',
      'punctuation',
      'space',
      'numberSign',
      'number',
      'punctuation',
    ]);
  });

  it('直引号按相邻位置区分左右', () => {
    const open = transcribe('"a').cells.find((c) => c.kind === 'punctuation')!;
    const close = transcribe('a"').cells.find((c) => c.kind === 'punctuation')!;
    expect(open.dots).toEqual([2, 3, 6]);
    expect(close.dots).toEqual([3, 5, 6]);
  });
});

describe('整词缩写', () => {
  const byWord = Object.fromEntries(CONTRACTIONS.map((c) => [c.word, dotsToGlyph(c.dots)]));

  it('五个词独立出现时各成一个点字', () => {
    for (const word of ['and', 'for', 'of', 'the', 'with']) {
      const r = transcribe(word);
      expect(r.cells).toHaveLength(1);
      expect(r.cells[0].kind).toBe('contraction');
      expect(r.cells[0].glyph).toBe(byWord[word]);
      expect(r.cells[0].srcStart).toBe(0);
      expect(r.cells[0].srcEnd).toBe(word.length);
    }
  });

  it('不吞单词内部字符：sandy/office/forum/wither/of', () => {
    expect(glyphs('sandy')).not.toContain(byWord.and);
    expect(glyphs('office')).not.toContain(byWord.of);
    expect(glyphs('forum')).not.toContain(byWord.for);
    expect(glyphs('wither')).not.toContain(byWord.with);
    expect(glyphs('off')).not.toContain(byWord.of);
  });

  it('被标点/空白包围时仍算整词：the. 与 (and)', () => {
    const r1 = transcribe('the.');
    expect(r1.cells[0].kind).toBe('contraction');
    const r2 = transcribe('(and)');
    expect(r2.cells.some((c) => c.kind === 'contraction')).toBe(true);
  });

  it('大写缩写：The -> ⠠+缩写，THE -> ⠠⠠+缩写', () => {
    const r1 = transcribe('The');
    expect(r1.cells.filter((c) => c.kind === 'capital')).toHaveLength(1);
    expect(r1.cells[r1.cells.length - 1].kind).toBe('contraction');
    const r2 = transcribe('THE');
    expect(r2.cells.filter((c) => c.kind === 'capital')).toHaveLength(2);
    expect(r2.cells[r2.cells.length - 1].kind).toBe('contraction');
  });

  it('逐词禁用：禁用后按字母展开', () => {
    const text = 'and and';
    const firstStart = 0;
    const r = transcribe(text, { disabledAt: new Set([firstStart]) });
    expect(r.cells[0].kind).toBe('letter'); // 第一个 and 被展开
    const second = r.cells.find((c) => c.contractionWord === 'and');
    expect(second).toBeTruthy();
  });

  it('禁用后展开的字母带 disabledWord 标记，且只覆盖该词', () => {
    const r = transcribe('and the', { disabledAt: new Set([0]) });
    const letters = r.cells.filter((c) => c.disabledWord === 'and');
    expect(letters).toHaveLength(3);
    expect(r.cells.some((c) => c.disabledWord === 'the')).toBe(false);
  });

  it('matchContraction：整词命中、词内不命中、带标点命中', () => {
    expect(matchContraction('sandy', 0)).toBeNull();
    expect(matchContraction('the.', 0)?.word).toBe('the');
    expect(matchContraction('of the', 3)?.word).toBe('the');
    expect(matchContraction('of the', 0)?.end).toBe(2);
  });
});

describe('未支持字符', () => {
  it('未支持字符被标出并保留，不丢弃', () => {
    const r = transcribe('a€b');
    const u = r.cells.filter((c) => c.kind === 'unsupported');
    expect(u).toHaveLength(1);
    expect(u[0].rawChar).toBe('€');
    expect(u[0].glyph).toBe(UNSUPPORTED_GLYPH);
    expect(r.unsupportedOffsets).toEqual([1]);
    // 前后字符仍然都在
    expect(r.cells.filter((c) => c.kind === 'letter')).toHaveLength(2);
  });
});

describe('双向映射', () => {
  it('点一个缩写点字 -> 反选整个源文词', () => {
    const r = transcribe('the');
    const idx = r.cells.findIndex((c) => c.kind === 'contraction');
    const range = cellSourceRange(r.cells[idx]);
    expect(range).toEqual({ start: 0, end: 3 });
  });

  it('选中源文一个大写字母 -> 定位到 ⠠ 与字母两个点字', () => {
    const r = transcribe('A');
    const hit = cellsCoveringRange(r.cells, 0, 1);
    expect(hit).toEqual([0, 1]);
  });

  it('选中源文数字串 -> 包含数字前缀与每个数字点字', () => {
    const r = transcribe('2024');
    const hit = cellsCoveringRange(r.cells, 0, 4);
    expect(hit).toEqual([0, 1, 2, 3, 4]);
  });

  it('在连续句子中选词不会串到相邻词', () => {
    const r = transcribe('and the');
    // 选 "the"（偏移 4..7）
    const hit = cellsCoveringRange(r.cells, 4, 7);
    expect(hit).toHaveLength(1);
    expect(r.cells[hit[0]].contractionWord).toBe('the');
  });

  it('缩写点字的源文区间覆盖整词长度', () => {
    const r = transcribe('with');
    expect(cellSourceRange(r.cells[0])).toEqual({ start: 0, end: 4 });
  });
});

describe('批注锚点', () => {
  it('未编辑时为 fresh', () => {
    const text = 'hello world';
    const a = { start: 6, end: 11, quote: 'world' };
    expect(resolveAnchor(text, text, a).status).toBe('fresh');
  });

  it('前文插入文字时批注随词平移（moved），不漂到别的词', () => {
    const oldText = 'see the cat';
    const newText = 'see the big cat';
    const a = { start: 8, end: 11, quote: 'cat' };
    const r = resolveAnchor(oldText, newText, a);
    expect(r.status).toBe('moved');
    expect(newText.slice(r.start, r.end)).toBe('cat');
  });

  it('出现两个等距同名片段时明确报 ambiguous', () => {
    const oldText = 'x the';
    const newText = 'the the';
    const a = { start: 2, end: 5, quote: 'the' };
    const r = resolveAnchor(oldText, newText, a);
    expect(r.status).toBe('ambiguous');
  });

  it('原词被删除时报 broken，而不是乱挂', () => {
    const oldText = 'the cat';
    const newText = 'the dog';
    const a = { start: 4, end: 7, quote: 'cat' };
    const r = resolveAnchor(oldText, newText, a);
    expect(r.status).toBe('broken');
  });
});
