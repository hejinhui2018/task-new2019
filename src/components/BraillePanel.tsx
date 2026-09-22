import { useEffect, useRef } from 'react';
import type { BrailleCell } from '../braille/transcribe';
import { DotCell } from './DotCell';

interface BraillePanelProps {
  cells: BrailleCell[];
  sourceText: string;
  /** 当前活动源文区间对应的盲符序号集合 */
  activeSeqs: ReadonlySet<number>;
  /** 最近一次点击点字产生的活动 token（用于 token 级整体高亮） */
  activeTokenIndex: number | null;
  contractedTokenIndexes: ReadonlySet<number>;
  disabledTokenIndexes: ReadonlySet<number>;
  annotatedTokenIndexes: ReadonlySet<number>;
  onCellClick: (cell: BrailleCell) => void;
}

/**
 * 点字面板：按 token 分组渲染；space cell 渲染为词间空隙并允许折行。
 * 点击任意盲符（含大写号/数字号前缀）都会选中其所属 token 的源文区间。
 */
export function BraillePanel({
  cells,
  sourceText,
  activeSeqs,
  activeTokenIndex,
  contractedTokenIndexes,
  disabledTokenIndexes,
  annotatedTokenIndexes,
  onCellClick,
}: BraillePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // jsdom 不实现 scrollIntoView，做可选链保护
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeTokenIndex, activeSeqs]);

  // 按 token 顺序分组
  const groups: { tokenIndex: number; cells: BrailleCell[] }[] = [];
  for (const cell of cells) {
    const last = groups[groups.length - 1];
    if (last && last.tokenIndex === cell.tokenIndex) last.cells.push(cell);
    else groups.push({ tokenIndex: cell.tokenIndex, cells: [cell] });
  }

  return (
    <div className="braille-panel" ref={panelRef}>
      {groups.map((group) => {
        const spaceOnly = group.cells.length === 1 && group.cells[0].kind === 'space';
        const tokenActive = group.tokenIndex === activeTokenIndex;
        const marked =
          contractedTokenIndexes.has(group.tokenIndex) ||
          disabledTokenIndexes.has(group.tokenIndex) ||
          annotatedTokenIndexes.has(group.tokenIndex);

        if (spaceOnly) {
          return (
            <span key={`space-${group.tokenIndex}`} className="braille-word braille-word--space" />
          );
        }

        return (
          <span
            key={group.tokenIndex}
            ref={tokenActive ? activeRef : undefined}
            className={[
              'braille-word',
              tokenActive ? 'braille-word--active' : '',
              contractedTokenIndexes.has(group.tokenIndex) ? 'braille-word--contracted' : '',
              disabledTokenIndexes.has(group.tokenIndex) ? 'braille-word--disabled' : '',
              annotatedTokenIndexes.has(group.tokenIndex) ? 'braille-word--annotated' : '',
              marked ? 'braille-word--marked' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-token-index={group.tokenIndex}
          >
            {group.cells.map((cell) => (
              <DotCell
                key={cell.seq}
                kind={cell.kind}
                dots={cell.dots}
                selected={activeSeqs.has(cell.seq)}
                rawChar={cell.kind === 'unsupported' ? sourceText.slice(cell.start, cell.end) : undefined}
                note={cell.note}
                onClick={() => onCellClick(cell)}
              />
            ))}
          </span>
        );
      })}
    </div>
  );
}
