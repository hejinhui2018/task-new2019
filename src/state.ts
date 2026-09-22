import { useCallback, useMemo, useReducer, useRef } from 'react';
import { Anchor, ResolvedAnchor, resolveAnchors } from './braille/anchors';
import { SAMPLE_TEXT, sampleAnnotations } from './braille/sample';

/** 批注：锚点 + 文案；status 为每次编辑后重定位的结果。 */
export interface Annotation {
  id: string;
  start: number;
  end: number;
  quote: string;
  text: string;
  status?: ResolvedAnchor['status'];
  note?: string;
}

/** 被禁用的整词缩写，锚点形式保存以支持编辑后重定位。 */
export type DisabledWord = Anchor;

export interface DocState {
  text: string;
  annotations: Annotation[];
  disabled: DisabledWord[];
}

/** 重定位过程中需要告诉用户的问题。 */
export interface AnchorIssue {
  kind: 'annotation-ambiguous' | 'annotation-broken' | 'disabled-lost';
  quote: string;
  annotationId?: string;
  detail: string;
}

interface HistoryState {
  past: DocState[];
  present: DocState;
  future: DocState[];
  /** 本次快照产生的定位问题（随 present 走，撤销时也要恢复）。 */
  issues: AnchorIssue[];
}

type Action =
  | { type: 'edit'; text: string; coalesce: boolean }
  | { type: 'addAnnotation'; id: string; start: number; end: number; quote: string; text: string }
  | { type: 'commitAnnotation'; id: string; text: string }
  | { type: 'removeAnnotation'; id: string }
  | { type: 'toggleDisabled'; anchor: Anchor }
  | { type: 'dismissIssue' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; state: DocState };

const HISTORY_LIMIT = 200;

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `n-${Date.now().toString(36)}-${idCounter}`;
}

export function initialState(): DocState {
  const annotations = sampleAnnotations();
  return {
    text: SAMPLE_TEXT,
    annotations: annotations.map((a, i) => ({
      id: `sample-${i}`,
      start: a.start,
      end: a.end,
      quote: SAMPLE_TEXT.slice(a.start, a.end),
      text: a.text,
    })),
    disabled: [],
  };
}

const STORAGE_KEY = 'braille-proofreader-doc-v1';

export function loadInitial(): DocState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as DocState;
    if (typeof parsed.text !== 'string' || !Array.isArray(parsed.annotations)) {
      return initialState();
    }
    return {
      text: parsed.text,
      annotations: parsed.annotations
        .filter(
          (a) =>
            a &&
            typeof a.start === 'number' &&
            typeof a.end === 'number' &&
            typeof a.text === 'string',
        )
        .map((a) => ({
          id: a.id || newId(),
          start: a.start,
          end: a.end,
          quote: typeof a.quote === 'string' ? a.quote : String(parsed.text.slice(a.start, a.end)),
          text: a.text,
          // status/note 是每次编辑后即时计算的易失信息，不从存储恢复。
        })),
      disabled: Array.isArray(parsed.disabled)
        ? parsed.disabled.filter(
            (d) => d && typeof d.start === 'number' && typeof d.end === 'number' && typeof d.quote === 'string',
          )
        : [],
    };
  } catch {
    return initialState();
  }
}

export function persist(doc: DocState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // 存储空间不足等情况：忽略，本次会话内容仍在内存中。
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** 编辑后重定位批注与禁用锚点，返回新文档状态与问题清单。 */
function reanchor(oldDoc: DocState, newText: string): { doc: DocState; issues: AnchorIssue[] } {
  const issues: AnchorIssue[] = [];

  const resolvedNotes = resolveAnchors(
    oldDoc.text,
    newText,
    oldDoc.annotations.map((a) => ({ start: a.start, end: a.end, quote: a.quote })),
  );
  const annotations: Annotation[] = [];
  oldDoc.annotations.forEach((a, i) => {
    const r = resolvedNotes[i];
    if (r.status === 'broken') {
      issues.push({
        kind: 'annotation-broken',
        quote: a.quote,
        annotationId: a.id,
        detail: `批注对应的原文 “${a.quote}” 在文中已不存在，批注保留在原位但不再跟随，请核对或删除。`,
      });
      annotations.push({ ...a, status: 'broken', note: r.note });
    } else if (r.status === 'ambiguous') {
      issues.push({
        kind: 'annotation-ambiguous',
        quote: a.quote,
        annotationId: a.id,
        detail: `批注 “${a.quote}” 有多个等距同名片段，无法判断应跟随哪一个，已暂留原位。`,
      });
      annotations.push({ ...a, status: 'ambiguous', note: r.note });
    } else {
      annotations.push({
        ...a,
        start: r.start,
        end: r.end,
        status: r.status === 'moved' ? 'moved' : undefined,
        note: r.note,
      });
    }
  });

  // 禁用锚点：无法唯一重定位时保守移除并明确提示（避免在错误位置恢复缩写）。
  const keptDisabled: DisabledWord[] = [];
  const resolvedDisabled = resolveAnchors(oldDoc.text, newText, oldDoc.disabled);
  oldDoc.disabled.forEach((d, i) => {
    const r = resolvedDisabled[i];
    if (r.status === 'fresh' || r.status === 'moved') {
      keptDisabled.push({ start: r.start, end: r.end, quote: r.quote });
    } else {
      issues.push({
        kind: 'disabled-lost',
        quote: d.quote,
        detail: `对 “${d.quote}” 的逐词禁用无法继续对应（${
          r.status === 'ambiguous' ? '同名片段不唯一' : '原文已不存在'
        }），已暂停该禁用；如仍需禁用请重新指定。`,
      });
    }
  });

  return { doc: { text: newText, annotations, disabled: keptDisabled }, issues };
}

function pushHistory(hist: HistoryState, next: DocState, issues: AnchorIssue[], coalesce: boolean): HistoryState {
  // 连续输入合并：整段打字只保留一个撤销检查点（输入前的状态已在栈顶）。
  if (coalesce && hist.past.length > 0) {
    return { past: hist.past, present: next, future: [], issues };
  }  const past = [...hist.past, hist.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [], issues };
}

function reducer(hist: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'edit': {
      if (action.text === hist.present.text) return hist;
      const { doc, issues } = reanchor(hist.present, action.text);
      return pushHistory(hist, doc, issues, action.coalesce);
    }
    case 'addAnnotation': {
      const annotation: Annotation = {
        id: action.id,
        start: action.start,
        end: action.end,
        quote: action.quote,
        text: action.text,
      };
      return {
        ...hist,
        past: [...hist.past, hist.present],
        present: { ...hist.present, annotations: [...hist.present.annotations, annotation] },
        future: [],
      };
    }
    case 'commitAnnotation': {
      // 批注内容编辑在失焦时一次性提交，只产生一个撤销检查点。
      const target = hist.present.annotations.find((a) => a.id === action.id);
      if (!target || target.text === action.text) return hist;
      const annotations = hist.present.annotations.map((a) =>
        a.id === action.id ? { ...a, text: action.text } : a,
      );
      return {
        ...hist,
        past: [...hist.past, hist.present],
        present: { ...hist.present, annotations },
        future: [],
      };
    }
    case 'removeAnnotation': {
      const annotations = hist.present.annotations.filter((a) => a.id !== action.id);
      return {
        ...hist,
        past: [...hist.past, hist.present],
        present: { ...hist.present, annotations },
        future: [],
      };
    }
    case 'toggleDisabled': {
      const exists = hist.present.disabled.some((d) => d.start === action.anchor.start);
      const disabled = exists
        ? hist.present.disabled.filter((d) => d.start !== action.anchor.start)
        : [...hist.present.disabled, action.anchor];
      return {
        ...hist,
        past: [...hist.past, hist.present],
        present: { ...hist.present, disabled },
        future: [],
      };
    }
    case 'dismissIssue':
      return { ...hist, issues: [] };
    case 'undo': {
      if (hist.past.length === 0) return hist;
      const previous = hist.past[hist.past.length - 1];
      return {
        past: hist.past.slice(0, -1),
        present: previous,
        future: [hist.present, ...hist.future],
        issues: [],
      };
    }
    case 'redo': {
      if (hist.future.length === 0) return hist;
      const [next, ...rest] = hist.future;
      return {
        past: [...hist.past, hist.present],
        present: next,
        future: rest,
        issues: [],
      };
    }
    case 'reset':
      return { past: [], present: action.state, future: [], issues: [] };
    default:
      return hist;
  }
}

export function useProofreader() {
  const [hist, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: loadInitial(),
    future: [],
    issues: [],
  }));
  const lastEditRef = useRef(0);

  const editText = useCallback((text: string, nativeInputType?: string) => {
    const now = performance.now();
    const typing =
      nativeInputType === 'insertText' ||
      nativeInputType === 'insertCompositionText' ||
      nativeInputType === 'deleteContentBackward' ||
      nativeInputType === 'deleteContentForward';
    const coalesce = typing && now - lastEditRef.current < 800;
    lastEditRef.current = now;
    dispatch({ type: 'edit', text, coalesce });
  }, []);

  const api = useMemo(
    () => ({
      doc: hist.present,
      issues: hist.issues,
      canUndo: hist.past.length > 0,
      canRedo: hist.future.length > 0,
      editText,
      addAnnotation: (id: string, start: number, end: number, quote: string, text = '') =>
        dispatch({ type: 'addAnnotation', id, start, end, quote, text }),
      commitAnnotation: (id: string, text: string) =>
        dispatch({ type: 'commitAnnotation', id, text }),
      removeAnnotation: (id: string) => dispatch({ type: 'removeAnnotation', id }),
      toggleDisabled: (anchor: Anchor) => dispatch({ type: 'toggleDisabled', anchor }),
      dismissIssues: () => dispatch({ type: 'dismissIssue' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      reset: (state: DocState) => dispatch({ type: 'reset', state }),
    }),
    [hist, editText],
  );

  return api;
}
