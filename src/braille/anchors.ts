/**
 * 锚点解析：源文被编辑后，重新定位批注/逐词禁用的位置。
 *
 * 批注不能“漂到别的词”。策略与多数带协作批注的编辑器一致：
 *  1. 记录批注创建时的原文片段 quote 与偏移；
 *  2. 新文本中原偏移处仍是 quote      -> fresh（原地）；
 *  3. 否则在全文找 quote 的出现位置：
 *       - 距离旧位置最近且唯一最近      -> moved（整体平移，仍是同一个词）；
 *       - 两个候选并列最近（距离相同）  -> ambiguous（无法判断是哪一个，提示用户）；
 *       - 完全找不到                    -> broken（明确提示无法继续对应）；
 *  4. 精确匹配失败再做一次“忽略空白与大小写”的宽松匹配，仍唯一则 moved。
 */

export interface Anchor {
  start: number;
  end: number;
  quote: string;
}

export type AnchorStatus = 'fresh' | 'moved' | 'ambiguous' | 'broken';

export interface ResolvedAnchor extends Anchor {
  status: AnchorStatus;
  note?: string;
}

function allOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) break;
    out.push(at);
    from = at + 1;
  }
  return out;
}

/** 生成忽略空白、忽略大小写的归一化文本，并保留到原始偏移的映射。 */
function normalize(s: string): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) continue;
    text += ch.toLowerCase();
    map.push(i);
  }
  return { text, map };
}

function pickNearest(
  occurrences: number[],
  oldStart: number,
): { start: number; status: AnchorStatus } {
  const scored = occurrences
    .map((start) => ({ start, d: Math.abs(start - oldStart) }))
    .sort((a, b) => a.d - b.d || a.start - b.start);
  const best = scored[0];
  const second = scored[1];
  // 并列最近 => 无法确定该落到哪一个同名片段：保持原位并报 ambiguous。
  if (second && second.d === best.d) return { start: oldStart, status: 'ambiguous' };
  return { start: best.start, status: 'moved' };
}

export function resolveAnchor(_oldText: string, newText: string, anchor: Anchor): ResolvedAnchor {
  const { start, end, quote } = anchor;

  // 1) 原地未动
  if (newText.slice(start, end) === quote) {
    return { start, end, quote, status: 'fresh' };
  }

  // 2) 精确查找
  const exact = allOccurrences(newText, quote);
  if (exact.length === 1) {
    return { start: exact[0], end: exact[0] + quote.length, quote, status: 'moved' };
  }
  if (exact.length > 1) {
    const pick = pickNearest(exact, start);
    if (pick.status === 'ambiguous') {
      return { start, end, quote, status: 'ambiguous', note: '文中有多个同名片段且距离相同，无法判断批注应跟随哪一个。' };
    }
    return { start: pick.start, end: pick.start + quote.length, quote, status: 'moved' };
  }

  // 3) 宽松匹配（忽略空白与大小写）
  const normOld = normalize(quote);
  if (normOld.text.length > 0) {
    const normNew = normalize(newText);
    const hits = allOccurrences(normNew.text, normOld.text);
    if (hits.length >= 1) {
      const normStart0 = normalize(newText.slice(0, start));
      const oldNormPos = normStart0.text.length;
      const scored = hits
        .map((p) => ({ p, d: Math.abs(p - oldNormPos) }))
        .sort((a, b) => a.d - b.d || a.p - b.p);
      const best = scored[0];
      const second = scored[1];
      if (!second || second.d !== best.d) {
        const origStart = normNew.map[best.p];
        const origEnd = normNew.map[best.p + normOld.text.length - 1] + 1;
        return {
          start: origStart,
          end: origEnd,
          quote,
          status: 'moved',
          note: '按忽略空白/大小写的宽松匹配重新定位，请核对。',
        };
      }
    }
  }

  // 4) 找不到
  return { start, end, quote, status: 'broken' };
}

export function resolveAnchors(
  oldText: string,
  newText: string,
  anchors: readonly Anchor[],
): ResolvedAnchor[] {
  return anchors.map((a) => resolveAnchor(oldText, newText, a));
}
