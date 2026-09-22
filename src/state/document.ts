/**
 * 文档状态：源文、带稳定 id 的 token、按 id 存储的批注与缩写禁用、
 * 撤销/重做历史。全部以纯函数/reducer 实现，便于测试。
 */

import { alignTokens, type IdToken, type Orphan } from '../braille/align';
import { tokenize } from '../braille/tokenize';

export interface DocModel {
  text: string;
  tokens: IdToken[];
  annotations: Map<number, string>;
  disabled: Set<number>;
  nextId: number;
}

export interface DocState extends DocModel {
  past: DocModel[];
  future: DocModel[];
  /** 最近一次编辑后无法继续对应的旧 token（批注/禁用去向） */
  orphans: Orphan[];
}

export type DocAction =
  | { type: 'edit'; text: string }
  | { type: 'setAnnotation'; id: number; value: string }
  | { type: 'toggleDisable'; id: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'load'; text: string }
  | { type: 'dismissOrphans' };

export function createModel(text: string): DocModel {
  const raws = tokenize(text);
  const tokens: IdToken[] = raws.map((t, i) => ({ ...t, id: i + 1 }));
  return { text, tokens, annotations: new Map(), disabled: new Set(), nextId: tokens.length + 1 };
}

function clone(model: DocModel): DocModel {
  return {
    text: model.text,
    tokens: model.tokens,
    annotations: new Map(model.annotations),
    disabled: new Set(model.disabled),
    nextId: model.nextId,
  };
}

function withoutHistory(model: DocModel, orphans: Orphan[]): DocState {
  return { ...clone(model), past: [], future: [], orphans };
}

export function initState(text: string): DocState {
  return withoutHistory(createModel(text), []);
}

function snapshot(state: DocState): DocModel {
  return {
    text: state.text,
    tokens: state.tokens,
    annotations: new Map(state.annotations),
    disabled: new Set(state.disabled),
    nextId: state.nextId,
  };
}

export function reducer(state: DocState, action: DocAction): DocState {
  switch (action.type) {
    case 'edit': {
      if (action.text === state.text) return state;
      const raws = tokenize(action.text);
      const aligned = alignTokens({
        oldTokens: state.tokens,
        newTokens: raws,
        annotations: state.annotations,
        disabled: state.disabled,
        nextId: state.nextId,
      });
      return {
        text: action.text,
        tokens: aligned.tokens,
        annotations: aligned.annotations,
        disabled: aligned.disabled,
        nextId: aligned.nextId,
        past: [...state.past, snapshot(state)],
        future: [],
        orphans: aligned.orphans,
      };
    }

    case 'setAnnotation': {
      const annotations = new Map(state.annotations);
      if (action.value.trim() === '') annotations.delete(action.id);
      else annotations.set(action.id, action.value);
      return { ...state, annotations, past: [...state.past, snapshot(state)], future: [] };
    }

    case 'toggleDisable': {
      const disabled = new Set(state.disabled);
      if (disabled.has(action.id)) disabled.delete(action.id);
      else disabled.add(action.id);
      return { ...state, disabled, past: [...state.past, snapshot(state)], future: [] };
    }

    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...clone(prev),
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
        orphans: [],
      };
    }

    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...clone(next),
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
        orphans: [],
      };
    }

    case 'load':
      return withoutHistory(createModel(action.text), []);

    case 'dismissOrphans':
      return state.orphans.length === 0 ? state : { ...state, orphans: [] };

    default:
      return state;
  }
}

/* ---------- localStorage 持久化 ---------- */

const STORAGE_KEY = 'braille-proofing-console/v1';

interface SerializedModel {
  text: string;
  tokens: IdToken[];
  annotations: [number, string][];
  disabled: number[];
  nextId: number;
}

export function serialize(model: DocModel): string {
  const data: SerializedModel = {
    text: model.text,
    tokens: model.tokens,
    annotations: [...model.annotations.entries()],
    disabled: [...model.disabled],
    nextId: model.nextId,
  };
  return JSON.stringify(data);
}

export function deserialize(raw: string): DocModel | null {
  try {
    const data = JSON.parse(raw) as SerializedModel;
    if (typeof data.text !== 'string' || !Array.isArray(data.tokens)) return null;
    // 以当前分词器重算区间，只复用 id 身份与挂载数据，避免存储陈旧几何信息
    const raws = tokenize(data.text);
    const aligned = alignTokens({
      oldTokens: data.tokens.map((t) => ({ ...t })),
      newTokens: raws,
      annotations: new Map(data.annotations),
      disabled: new Set(data.disabled),
      nextId: data.nextId,
    });
    return {
      text: data.text,
      tokens: aligned.tokens,
      annotations: aligned.annotations,
      disabled: aligned.disabled,
      nextId: aligned.nextId,
    };
  } catch {
    return null;
  }
}

export function loadStored(): DocModel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function saveStored(model: DocModel): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(model));
  } catch {
    // 存储不可用时静默降级（刷新后回到示例），不影响编辑功能
  }
}
