import { describe, expect, it } from 'vitest';
import {
  createModel,
  deserialize,
  initState,
  reducer,
  serialize,
} from '../state/document';

function tokenIdAt(state: ReturnType<typeof initState>, text: string, occurrence = 0) {
  const matches = state.tokens.filter((t) => t.text === text);
  return matches[occurrence].id;
}

describe('文档 reducer', () => {
  it('编辑产生撤销历史，撤销恢复原文与批注状态', () => {
    let s = initState('the cat');
    const theId = tokenIdAt(s, 'the');
    s = reducer(s, { type: 'setAnnotation', id: theId, value: '缩写点字=t' });
    expect(s.annotations.get(theId)).toBe('缩写点字=t');

    s = reducer(s, { type: 'edit', text: 'the dog' });
    expect(s.text).toBe('the dog');
    expect(s.past.length).toBe(2);

    s = reducer(s, { type: 'undo' });
    expect(s.text).toBe('the cat');
    expect(s.annotations.get(theId)).toBe('缩写点字=t');

    s = reducer(s, { type: 'redo' });
    expect(s.text).toBe('the dog');
  });

  it('空批注会被删除而不是存空串', () => {
    let s = initState('the');
    const id = s.tokens[0].id;
    s = reducer(s, { type: 'setAnnotation', id, value: 'x' });
    s = reducer(s, { type: 'setAnnotation', id, value: '   ' });
    expect(s.annotations.size).toBe(0);
  });

  it('逐词禁用缩写可切换', () => {
    let s = initState('and');
    const id = s.tokens[0].id;
    s = reducer(s, { type: 'toggleDisable', id });
    expect(s.disabled.has(id)).toBe(true);
    s = reducer(s, { type: 'toggleDisable', id });
    expect(s.disabled.has(id)).toBe(false);
  });

  it('在词中间编辑后批注仍挂在同一身份（不漂移）', () => {
    let s = initState('the cat and');
    const catId = tokenIdAt(s, 'cat');
    s = reducer(s, { type: 'setAnnotation', id: catId, value: '猫' });
    s = reducer(s, { type: 'edit', text: 'the cats and' });
    const cats = s.tokens.find((t) => t.text === 'cats')!;
    expect(cats.id).toBe(catId);
    expect(s.annotations.get(cats.id)).toBe('猫');
  });

  it('删除带批注的词后出现 orphan，撤销可恢复', () => {
    let s = initState('the cat');
    const theId = tokenIdAt(s, 'the');
    s = reducer(s, { type: 'setAnnotation', id: theId, value: '别丢' });
    s = reducer(s, { type: 'edit', text: 'cat' });
    expect(s.orphans).toHaveLength(1);
    expect(s.orphans[0].annotation).toBe('别丢');
    s = reducer(s, { type: 'undo' });
    expect(s.text).toBe('the cat');
    expect(s.annotations.get(theId)).toBe('别丢');
  });

  it('load 清空历史与批注', () => {
    let s = initState('the');
    const id = s.tokens[0].id;
    s = reducer(s, { type: 'setAnnotation', id, value: 'x' });
    s = reducer(s, { type: 'load', text: '2024' });
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(0);
    expect(s.annotations.size).toBe(0);
    expect(s.tokens.some((t) => t.kind === 'number')).toBe(true);
  });
});

describe('序列化 / 反序列化（刷新恢复）', () => {
  it('往返保留文字、批注与禁用', () => {
    const model = createModel('and the');
    const andId = model.tokens[0].id;
    model.annotations.set(andId, '禁用它');
    model.disabled.add(andId);
    const restored = deserialize(serialize(model))!;
    expect(restored.text).toBe('and the');
    const andTok = restored.tokens[0];
    expect(restored.annotations.get(andTok.id)).toBe('禁用它');
    expect(restored.disabled.has(andTok.id)).toBe(true);
  });

  it('损坏的存储内容安全返回 null', () => {
    expect(deserialize('not json')).toBeNull();
  });
});
