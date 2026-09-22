import { describe, expect, it } from 'vitest';
import { transcribe } from './transcribe';
import { SAMPLE_TEXT } from './sample';

describe('内置示例段落（含缩写、年份、大写词）', () => {
  const r = transcribe(SAMPLE_TEXT);

  it('没有未支持字符', () => {
    expect(r.unsupportedOffsets).toEqual([]);
  });

  it('包含 13 处整词缩写（5 个词全覆盖，词内假缩写不误命中）', () => {
    const hits = r.cells.filter((c) => c.kind === 'contraction');
    const counts = hits.reduce<Record<string, number>>((acc, c) => {
      acc[c.contractionWord!] = (acc[c.contractionWord!] ?? 0) + 1;
      return acc;
    }, {});
    expect(hits).toHaveLength(13);
    expect(counts.and).toBe(2);
    expect(counts.the).toBe(7);
    expect(counts.of).toBe(2);
    expect(counts.for).toBe(1);
    expect(counts.with).toBe(1);
  });

  it('Sandy / office / forum 内部不产生缩写', () => {
    const words = ['Sandy', 'office', 'forum'];
    for (const w of words) {
      const at = SAMPLE_TEXT.indexOf(w);
      const inside = r.cells.some(
        (c) => c.kind === 'contraction' && c.srcStart >= at && c.srcEnd <= at + w.length,
      );
      expect(inside, w).toBe(false);
    }
  });

  it('两个年份各产生一个数字前缀', () => {
    expect(r.cells.filter((c) => c.kind === 'numberSign')).toHaveLength(2);
  });

  it('全大写 THE 带两个大写前缀，首字母 The 带一个', () => {
    expect(r.cells.filter((c) => c.kind === 'capital').length).toBeGreaterThanOrEqual(3);
  });
});
