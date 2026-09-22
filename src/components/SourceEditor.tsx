import { useMemo, useRef, type ChangeEvent, type ReactNode, type RefObject, type UIEvent } from 'react';
import type { IdToken } from '../braille/align';

export interface CharRange {
  start: number;
  end: number;
}

interface SourceEditorProps {
  text: string;
  tokens: IdToken[];
  activeRange: CharRange | null;
  annotatedIds: ReadonlySet<number>;
  disabledIds: ReadonlySet<number>;
  contractedIds: ReadonlySet<number>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (text: string) => void;
  onSelectRange: (range: CharRange | null) => void;
}

/**
 * 透明 textarea 叠在格式完全一致的镜像 pre 上：
 * textarea 负责输入与原生选区，镜像层负责 token 状态与活动区间高亮。
 */
export function SourceEditor({
  text,
  tokens,
  activeRange,
  annotatedIds,
  disabledIds,
  contractedIds,
  textareaRef,
  onChange,
  onSelectRange,
}: SourceEditorProps) {
  const mirrorRef = useRef<HTMLPreElement>(null);

  const mirror = useMemo(() => {
    const nodes: ReactNode[] = [];
    const range = activeRange && activeRange.end > activeRange.start ? activeRange : null;

    for (const tok of tokens) {
      const classes = ['src-token', `src-token--${tok.kind}`];
      if (annotatedIds.has(tok.id)) classes.push('src-token--annotated');
      if (disabledIds.has(tok.id)) classes.push('src-token--disabled');
      if (contractedIds.has(tok.id)) classes.push('src-token--contracted');

      const overlap =
        range && tok.start < range.end && tok.end > range.start
          ? {
              from: Math.max(tok.start, range.start),
              to: Math.min(tok.end, range.end),
            }
          : null;

      if (!overlap) {
        nodes.push(
          <span key={tok.id} className={classes.join(' ')} data-token-id={tok.id}>
            {tok.text}
          </span>,
        );
        continue;
      }

      // 在 token 内部切出精确的活动字符区间
      const localFrom = overlap.from - tok.start;
      const localTo = overlap.to - tok.start;
      nodes.push(
        <span key={tok.id} className={classes.join(' ')} data-token-id={tok.id}>
          {localFrom > 0 && tok.text.slice(0, localFrom)}
          <span className="src-token__range">{tok.text.slice(localFrom, localTo)}</span>
          {localTo < tok.text.length && tok.text.slice(localTo)}
        </span>,
      );
    }

    // 结尾换行哨兵：保证最后一行换行在 pre 中有高度
    if (text.endsWith('\n')) nodes.push('\n');
    return nodes;
  }, [text, tokens, activeRange, annotatedIds, disabledIds, contractedIds]);

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    if (mirrorRef.current) {
      mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
      mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const emitSelection = (el: HTMLTextAreaElement) => {
    if (el.selectionStart === el.selectionEnd) {
      // 折叠光标：不抢活动定位，避免点击编辑时跳选点字
      onSelectRange(null);
      return;
    }
    onSelectRange({ start: el.selectionStart, end: el.selectionEnd });
  };

  return (
    <div className="editor">
      <pre ref={mirrorRef} className="editor__mirror" aria-hidden="true">
        {mirror}
      </pre>
      <textarea
        ref={textareaRef}
        className="editor__input"
        value={text}
        spellCheck={false}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        onScroll={handleScroll}
        onSelect={(e) => emitSelection(e.currentTarget)}
        aria-label="源文编辑区"
      />
    </div>
  );
}
