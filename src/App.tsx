import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { transcribe, cellsCoveringRange, cellSourceRange, matchContraction } from './braille/transcribe';
import { Annotation, clearStorage, initialState, newId, persist, useProofreader } from './state';
import BraillePane from './components/BraillePane';
import RulesModal from './components/RulesModal';

export default function App() {
  const api = useProofreader();
  const { doc } = api;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [rulesOpen, setRulesOpen] = useState(false);
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [activeCell, setActiveCell] = useState<number | null>(null);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  /** 批注输入框的本地草稿：失焦时一次性提交进撤销栈。 */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // 转写：禁用集合以词起始偏移为键。
  const disabledStarts = useMemo(() => new Set(doc.disabled.map((d) => d.start)), [doc.disabled]);
  const { cells, unsupportedOffsets } = useMemo(
    () => transcribe(doc.text, { disabledAt: disabledStarts }),
    [doc.text, disabledStarts],
  );

  // 持久化（刷新恢复）。
  useEffect(() => {
    persist(doc);
  }, [doc]);

  // 外部内容变化（撤销/重做/恢复）后，收敛选区并清掉可能已错位的点字选中态。
  useEffect(() => {
    const max = doc.text.length;
    setSel((s) => ({
      start: Math.min(s.start, max),
      end: Math.min(s.end, max),
    }));
    setActiveCell(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.text]);

  // ---- 快捷键：Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做 ----
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        apiRef.current.undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        apiRef.current.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- 源文选区 -> 对应点字 ----
  const highlightedCells = useMemo(
    () => new Set(cellsCoveringRange(cells, sel.start, sel.end)),
    [cells, sel.start, sel.end],
  );

  const syncSelection = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    setSel({ start: ta.selectionStart, end: ta.selectionEnd });
    setActiveCell(null);
  }, []);

  // ---- 点字 -> 反选源文 ----
  const handleCellClick = useCallback(
    (index: number) => {
      const cell = cells[index];
      if (!cell) return;
      const range = cellSourceRange(cell);
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(range.start, range.end);
      }
      setSel(range);
      setActiveCell(index);
    },
    [cells],
  );

  // 选区是否正好覆盖一个整词缩写词（无论当前是否被禁用）。
  const selectedMatch = useMemo(() => {
    if (sel.start === sel.end) return undefined;
    const m = matchContraction(doc.text, sel.start);
    return m && m.end === sel.end ? m : undefined;
  }, [doc.text, sel]);

  const selectedDisabled = useMemo(
    () => doc.disabled.find((d) => d.start === sel.start && d.end === sel.end),
    [doc.disabled, sel],
  );

  const addAnnotation = () => {
    if (sel.start === sel.end) return;
    // 同一选区不重复添加。
    if (api.doc.annotations.some((a) => a.start === sel.start && a.end === sel.end)) {
      setActiveAnnotation(
        api.doc.annotations.find((a) => a.start === sel.start && a.end === sel.end)!.id,
      );
      return;
    }
    const quote = doc.text.slice(sel.start, sel.end);
    const id = newId();
    api.addAnnotation(id, sel.start, sel.end, quote, '');
    setDrafts((d) => ({ ...d, [id]: '' }));
    setActiveAnnotation(id);
  };

  const focusAnnotation = (a: Annotation) => {
    setActiveAnnotation(a.id);
    const ta = textareaRef.current;
    if (ta && a.status !== 'broken') {
      ta.focus();
      ta.setSelectionRange(a.start, a.end);
      setSel({ start: a.start, end: a.end });
      setActiveCell(null);
    }
  };

  const resetSample = () => {
    clearStorage();
    api.reset(initialState());
    setSel({ start: 0, end: 0 });
    setActiveCell(null);
  };

  const annotationRanges = doc.annotations.map((a) => ({
    start: a.start,
    end: a.end,
    broken: a.status === 'broken',
  }));

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>六点盲文转写校对台</h1>
          <p className="subtitle">
            英语盲文教学子集 · 数据仅保存在本机浏览器 · 打开即恢复上次内容
          </p>
        </div>
        <div className="top-actions">
          <button className="btn" onClick={api.undo} disabled={!api.canUndo} title="Ctrl/Cmd+Z">↶ 撤销</button>
          <button className="btn" onClick={api.redo} disabled={!api.canRedo} title="Ctrl/Cmd+Shift+Z">↷ 重做</button>
          <button className="btn" onClick={() => setRulesOpen(true)}>📖 规则与适用范围</button>
          <button className="btn btn-warn" onClick={resetSample}>恢复示例段落</button>
        </div>
      </header>

      {api.issues.length > 0 && (
        <div className="issue-banner" role="alert">
          <div className="issue-title">⚠️ 有 {api.issues.length} 处对应关系需要确认：</div>
          <ul>
            {api.issues.map((iss, i) => (
              <li key={i}>{iss.detail}</li>
            ))}
          </ul>
          <button className="btn btn-small" onClick={api.dismissIssues}>知道了</button>
        </div>
      )}

      <main className="panels">
        <section className="panel source-panel">
          <div className="panel-head">
            <h2>源文（可编辑）</h2>
            <span className="panel-stat">{doc.text.length} 字符</span>
          </div>
          <textarea
            ref={textareaRef}
            className="source-editor"
            value={doc.text}
            spellCheck={false}
            onChange={(e) => {
              const ta = e.nativeEvent as InputEvent;
              api.editText(e.target.value, ta.inputType);
              requestAnimationFrame(syncSelection);
            }}
            onSelect={syncSelection}
            onKeyUp={syncSelection}
            onMouseUp={syncSelection}
            aria-label="源文编辑区"
          />
          <div className="selection-bar">
            {sel.start !== sel.end ? (
              <>
                <span className="sel-info">
                  已选 “{doc.text.slice(sel.start, sel.end)}”（{sel.end - sel.start} 字符）→ 对应{' '}
                  {highlightedCells.size} 个点字
                </span>
                <button className="btn btn-small" onClick={addAnnotation}>＋ 添加批注</button>
                {selectedMatch && !selectedDisabled && (
                  <button
                    className="btn btn-small btn-warn"
                    onClick={() =>
                      api.toggleDisabled({
                        start: sel.start,
                        end: sel.end,
                        quote: doc.text.slice(sel.start, sel.end),
                      })
                    }
                  >
                    禁用 “{selectedMatch.word}” 的整词缩写（按字母展开校对）
                  </button>
                )}
                {selectedDisabled && (
                  <button
                    className="btn btn-small"
                    onClick={() =>
                      api.toggleDisabled({ start: sel.start, end: sel.end, quote: selectedDisabled.quote })
                    }
                  >
                    重新启用 “{selectedDisabled.quote}” 的缩写
                  </button>
                )}
              </>
            ) : (
              <span className="sel-info hint">在源文中拖选文字可定位点字；点击右侧点字可反选词。</span>
            )}
          </div>
        </section>

        <section className="panel braille-panel">
          <div className="panel-head">
            <h2>点字（六点盲文）</h2>
            <span className="panel-stat">
              {cells.filter((c) => c.kind !== 'space' && c.kind !== 'newline').length} 个点字
              {unsupportedOffsets.length > 0 && (
                <em className="bad"> · {unsupportedOffsets.length} 个未支持字符</em>
              )}
            </span>
          </div>
          <BraillePane
            cells={cells}
            highlighted={highlightedCells}
            activeIndex={activeCell}
            disabled={doc.disabled}
            annotationRanges={annotationRanges}
            onCellClick={handleCellClick}
          />
          <div className="legend">
            <span><i className="lg contraction" />整词缩写（一詞一点字）</span>
            <span><i className="lg prefix" />前缀 ⠠/⠼（无原文宽度）</span>
            <span><i className="lg mapped" />当前对应</span>
            <span><i className="lg note" />含批注</span>
            <span><i className="lg bad" />未支持字符（保留原文）</span>
          </div>
          {activeCell !== null && cells[activeCell] && (
            <div className={`cell-explain kind-bg-${cells[activeCell].kind}`}>
              <strong>{explainTitle(cells[activeCell].kind)}</strong>
              <span>{cells[activeCell].label}</span>
            </div>
          )}
        </section>
      </main>

      <section className="annotations">
        <div className="panel-head">
          <h2>批注与逐词校对</h2>
          <span className="panel-stat">{doc.annotations.length} 条批注 · {doc.disabled.length} 个词禁用缩写</span>
        </div>
        {doc.annotations.length === 0 && doc.disabled.length === 0 ? (
          <p className="hint">还没有批注。在源文中选词后点“添加批注”；选中原型缩写词可逐词禁用缩写。</p>
        ) : (
          <ul className="annotation-list">
            {doc.annotations.map((a) => (
              <li
                key={a.id}
                className={[
                  'annotation-item',
                  activeAnnotation === a.id ? 'active' : '',
                  a.status === 'broken' ? 'broken' : '',
                  a.status === 'ambiguous' ? 'ambiguous' : '',
                  a.status === 'moved' ? 'moved' : '',
                ].join(' ')}
              >
                <div className="ann-head">
                  <button className="ann-quote" onClick={() => focusAnnotation(a)} title="定位到源文">
                    “{a.quote}”
                  </button>
                  {a.status === 'moved' && <span className="badge badge-moved" title={a.note}>已随编辑跟随</span>}
                  {a.status === 'ambiguous' && <span className="badge badge-ambiguous">同名片段不唯一，暂留原位</span>}
                  {a.status === 'broken' && <span className="badge badge-broken">原文已不存在，无法继续对应</span>}
                  <button className="btn btn-small btn-danger" onClick={() => api.removeAnnotation(a.id)}>删除</button>
                </div>
                <input
                  className="ann-input"
                  value={drafts[a.id] ?? a.text}
                  placeholder="写下校对意见……（如：此处缩写是否适用、点位是否正确）"
                  autoFocus={activeAnnotation === a.id}
                  onChange={(e) => setDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                  onBlur={(e) => {
                    api.commitAnnotation(a.id, e.target.value);
                    setDrafts((d) => {
                      const next = { ...d };
                      delete next[a.id];
                      return next;
                    });
                  }}
                />
              </li>
            ))}
            {doc.disabled.map((d) => {
              const stillMatches =
                matchContraction(doc.text, d.start)?.end === d.end &&
                doc.text.slice(d.start, d.end).toLowerCase() === d.quote.toLowerCase();
              return (
                <li key={`dis-${d.start}`} className="annotation-item disabled-word">
                  <div className="ann-head">
                    <button className="ann-quote" onClick={() => focusAnnotation({
                      id: '', start: d.start, end: d.end, quote: d.quote, text: '',
                    })}>
                      “{d.quote}”
                    </button>
                    <span className="badge badge-off">缩写已禁用 · 按字母展开</span>
                    <button
                      className="btn btn-small"
                      onClick={() => api.toggleDisabled(d)}
                      disabled={!stillMatches}
                      title={stillMatches ? '' : '该位置当前不是可缩写词'}
                    >
                      重新启用
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </div>
  );
}

function explainTitle(kind: string): string {
  switch (kind) {
    case 'contraction': return '整词缩写';
    case 'letter': return '字母';
    case 'number': return '数字';
    case 'capital': return '大写前缀';
    case 'numberSign': return '数字前缀';
    case 'punctuation': return '标点';
    case 'unsupported': return '未支持字符';
    case 'space': return '空格';
    default: return '点字';
  }
}
