import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { transcribe } from './braille/transcribe';
import { WORD_CONTRACTIONS } from './braille/dots';
import { SAMPLE_PARAGRAPH } from './braille/sample';
import {
  initState,
  reducer,
  loadStored,
  saveStored,
  type DocState,
} from './state/document';
import { SourceEditor, type CharRange } from './components/SourceEditor';
import { BraillePanel } from './components/BraillePanel';
import { ProofingPanel } from './components/ProofingPanel';
import { OrphanBanner } from './components/OrphanBanner';
import { RulesPanel } from './components/RulesPanel';

function init(): DocState {
  const stored = loadStored();
  return stored
    ? { ...stored, past: [], future: [], orphans: [] }
    : initState(SAMPLE_PARAGRAPH);
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [activeTokenId, setActiveTokenId] = useState<number | null>(null);
  const [activeRange, setActiveRange] = useState<CharRange | null>(null);
  // 编辑/撤销后，旧选区基于过期偏移，不再渲染蓝色区间；校对面板仍跟随词身份
  const [rangeStale, setRangeStale] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 刷新恢复：任何变化后写回 localStorage
  useEffect(() => {
    saveStored(state);
  }, [state.text, state.tokens, state.annotations, state.disabled]);

  const disabledIndexes = useMemo(() => {
    const s = new Set<number>();
    for (const t of state.tokens) if (state.disabled.has(t.id)) s.add(t.index);
    return s;
  }, [state.tokens, state.disabled]);

  const transcription = useMemo(
    () => transcribe(state.tokens, { disabledTokens: disabledIndexes }),
    [state.tokens, disabledIndexes],
  );

  const tokenById = useMemo(() => new Map(state.tokens.map((t) => [t.id, t])), [state.tokens]);
  const contractedIds = useMemo(() => {
    const s = new Set<number>();
    for (const idx of transcription.contractedTokenIndexes) {
      const t = state.tokens.find((tok) => tok.index === idx);
      if (t) s.add(t.id);
    }
    return s;
  }, [transcription.contractedTokenIndexes, state.tokens]);

  const annotatedIds = useMemo(() => new Set(state.annotations.keys()), [state.annotations]);

  const annotatedTokenIndexes = useMemo(
    () => new Set(state.tokens.filter((t) => annotatedIds.has(t.id)).map((t) => t.index)),
    [state.tokens, annotatedIds],
  );

  const activeToken = activeTokenId !== null ? (tokenById.get(activeTokenId) ?? null) : null;
  const effectiveRange: CharRange | null = rangeStale
    ? null
    : activeRange ?? (activeToken ? { start: activeToken.start, end: activeToken.end } : null);

  const activeSeqs = useMemo(() => {
    const s = new Set<number>();
    if (effectiveRange) {
      for (const c of transcription.cells) {
        if (c.kind !== 'space' && c.start < effectiveRange.end && c.end > effectiveRange.start) {
          s.add(c.seq);
        }
      }
    }
    return s;
  }, [transcription.cells, effectiveRange]);

  const activeTokenCells = useMemo(
    () => (activeToken ? transcription.cells.filter((c) => c.tokenIndex === activeToken.index) : []),
    [transcription.cells, activeToken],
  );

  const syncTextareaSelection = (range: CharRange) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(range.start, range.end);
  };

  const handleCellClick = (tokenId: number, range: CharRange) => {
    setRangeStale(false);
    setActiveTokenId(tokenId);
    setActiveRange(range);
    syncTextareaSelection(range);
  };

  const handleSourceRange = (range: CharRange | null) => {
    setRangeStale(false);
    setActiveRange(range);
    if (!range) {
      setActiveTokenId(null);
      return;
    }
    const hit = state.tokens.find((t) => t.start < range.end && t.end > range.start);
    setActiveTokenId(hit ? hit.id : null);
  };

  const handleEdit = (text: string) => {
    // 区间基于旧偏移，编辑后标为过期；token 身份仍在时校对面板继续跟随
    setActiveRange(null);
    setRangeStale(true);
    dispatch({ type: 'edit', text });
  };

  // 撤销/重做/快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        setActiveRange(null);
        setRangeStale(true);
        dispatch({ type: 'undo' });
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        setActiveRange(null);
        setRangeStale(true);
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const canContractWord = activeToken?.kind === 'word'
    && Object.prototype.hasOwnProperty.call(WORD_CONTRACTIONS, activeToken.text.toLowerCase());

  return (
    <div className="app">
      <header className="topbar">
        <h1>英文六点盲文转写校对台</h1>
        <div className="topbar__actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setActiveRange(null);
              setRangeStale(true);
              setActiveTokenId(null);
              dispatch({ type: 'undo' });
            }}
            disabled={state.past.length === 0}
            title="Ctrl/Cmd+Z"
          >
            ↶ 撤销
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setActiveRange(null);
              setRangeStale(true);
              dispatch({ type: 'redo' });
            }}
            disabled={state.future.length === 0}
            title="Ctrl/Cmd+Shift+Z"
          >
            ↷ 重做
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setActiveRange(null);
              setRangeStale(true);
              setActiveTokenId(null);
              dispatch({ type: 'load', text: SAMPLE_PARAGRAPH });
            }}
          >
            载入示例
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setRulesOpen(true)}>
            规则与适用范围
          </button>
        </div>
      </header>

      <OrphanBanner orphans={state.orphans} onDismiss={() => dispatch({ type: 'dismissOrphans' })} />

      <main className="layout">
        <section className="pane" aria-label="源文">
          <h2 className="pane__title">
            源文（可直接编辑）
            <span className="pane__hint">拖选文字可定位右侧点字</span>
          </h2>
          <SourceEditor
            text={state.text}
            tokens={state.tokens}
            activeRange={effectiveRange}
            annotatedIds={annotatedIds}
            disabledIds={state.disabled}
            contractedIds={contractedIds}
            textareaRef={textareaRef}
            onChange={handleEdit}
            onSelectRange={handleSourceRange}
          />
        </section>

        <section className="pane" aria-label="点字转写">
          <h2 className="pane__title">
            点字转写（点击任一点字反选源文）
            {transcription.unsupported.length > 0 && (
              <span className="pane__warn" data-testid="unsupported-count">
                {transcription.unsupported.length} 个未支持字符已标出
              </span>
            )}
          </h2>
          <BraillePanel
            cells={transcription.cells}
            sourceText={state.text}
            activeSeqs={activeSeqs}
            activeTokenIndex={activeToken ? activeToken.index : null}
            contractedTokenIndexes={new Set(transcription.contractedTokenIndexes)}
            disabledTokenIndexes={disabledIndexes}
            annotatedTokenIndexes={annotatedTokenIndexes}
            onCellClick={(cell) => {
              const tok = state.tokens.find((t) => t.index === cell.tokenIndex);
              if (tok) handleCellClick(tok.id, { start: tok.start, end: tok.end });
            }}
          />
        </section>

        <ProofingPanel
          token={activeToken}
          cells={activeTokenCells}
          annotation={activeToken ? (state.annotations.get(activeToken.id) ?? '') : ''}
          disabled={activeToken ? state.disabled.has(activeToken.id) : false}
          canContract={Boolean(canContractWord)}
          onAnnotationChange={(value) =>
            activeToken && dispatch({ type: 'setAnnotation', id: activeToken.id, value })
          }
          onToggleDisable={() =>
            activeToken && dispatch({ type: 'toggleDisable', id: activeToken.id })
          }
        />
      </main>

      <footer className="statusbar">
        <span>缩写词：{transcription.contractedTokenIndexes.length}</span>
        <span>未支持：{transcription.unsupported.length}</span>
        <span>批注：{state.annotations.size}</span>
        <span>数据自动保存在本浏览器 localStorage，刷新页面自动恢复。</span>
      </footer>

      <RulesPanel open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}
