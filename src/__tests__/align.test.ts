import { describe, expect, it } from 'vitest';
import { tokenize } from '../braille/tokenize';
import { alignTokens, type IdToken } from '../braille/align';

function withIds(text: string, idFrom = 1): IdToken[] {
  return tokenize(text).map((t, i) => ({ ...t, id: idFrom + i }));
}

function align(oldText: string, newText: string, noteByText?: Record<string, string>) {
  const oldTokens = withIds(oldText);
  const annotations = new Map<number, string>();
  const disabled = new Set<number>();
  for (const [text, note] of Object.entries(noteByText ?? {})) {
    const tok = oldTokens.find((t) => t.text === text)!;
    annotations.set(tok.id, note);
  }
  return {
    oldTokens,
    ...alignTokens({
      oldTokens,
      newTokens: tokenize(newText),
      annotations,
      disabled,
      nextId: oldTokens.length + 1,
    }),
  };
}

describe('token 身份对齐', () => {
  it('编辑点之前/之后的 token 身份保持不变', () => {
    const { tokens, oldTokens } = align('cat dog fox', 'cat doggy fox');
    const cat = tokens.find((t) => t.text === 'cat')!;
    const fox = tokens.find((t) => t.text === 'fox')!;
    expect(cat.id).toBe(oldTokens.find((t) => t.text === 'cat')!.id);
    expect(fox.id).toBe(oldTokens.find((t) => t.text === 'fox')!.id);
  });

  it('在词中间插入一个字符，该词身份跟随（批注不漂到后词）', () => {
    const { tokens, oldTokens } = align('cat and hat', 'cats and hat', { cat: '核对 c' });
    const newCats = tokens.find((t) => t.text === 'cats')!;
    expect(newCats.id).toBe(oldTokens.find((t) => t.text === 'cat')!.id);
  });

  it('被整词替换时批注进入 orphan 并明确列出', () => {
    const result = (() => {
      const oldTokens = withIds('the cat');
      const the = oldTokens.find((t) => t.text === 'the')!;
      return alignTokens({
        oldTokens,
        newTokens: tokenize('dog cat'),
        annotations: new Map([[the.id, '注意 the 缩写']]),
        disabled: new Set(),
        nextId: 100,
      });
    })();
    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0].text).toBe('the');
    expect(result.orphans[0].annotation).toBe('注意 the 缩写');
    // 批注没有被带到 dog 上
    expect(result.annotations.size).toBe(0);
  });

  it('删除一个被禁用缩写的词：禁用标记进入 orphan，不静默消失', () => {
    const oldTokens = withIds('and the');
    const andTok = oldTokens.find((t) => t.text === 'and')!;
    const r = alignTokens({
      oldTokens,
      newTokens: tokenize('the'),
      annotations: new Map(),
      disabled: new Set([andTok.id]),
      nextId: 50,
    });
    expect(r.orphans[0].hadDisabled).toBe(true);
    expect(r.orphans[0].text).toBe('and');
  });

  it('普通删除无批注的词不产生 orphan 噪音', () => {
    const r = align('a b c', 'a c');
    expect(r.orphans).toHaveLength(0);
  });

  it('相同形态的词在重排时通过保序匹配保留身份', () => {
    // 两个 the（中间含空格 token：the0 space1 fox2 space3 the4），
    // 在句首插入词后，两个 the 的 id 都应保持
    const oldTokens = withIds('the fox the');
    const firstThe = oldTokens[0]!;
    const secondThe = oldTokens[4]!;
    const r = alignTokens({
      oldTokens,
      newTokens: tokenize('quick the fox the'),
      annotations: new Map([
        [firstThe.id, '第一个'],
        [secondThe.id, '第二个'],
      ]),
      disabled: new Set(),
      nextId: 99,
    });
    const news = r.tokens.filter((t) => t.text === 'the');
    expect(news.map((t) => t.id).sort()).toEqual([firstThe.id, secondThe.id].sort());
    expect(r.annotations.get(firstThe.id)).toBe('第一个');
    expect(r.annotations.get(secondThe.id)).toBe('第二个');
  });
});
