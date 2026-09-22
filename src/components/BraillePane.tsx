import { useMemo } from 'react';
import { Cell } from '../braille/rules';
import { DisabledWord } from '../state';

interface Props {
  cells: readonly Cell[];
  /** 高亮的点字下标集合（源文选区映射而来）。 */
  highlighted: ReadonlySet<number>;
  /** 主选中（点击点字产生）的下标。 */
  activeIndex: number | null;
  disabled: readonly DisabledWord[];
  annotationRanges: readonly { start: number; end: number; broken?: boolean }[];
  onCellClick: (index: number) => void;
}

export default function BraillePane({
  cells,
  highlighted,
  activeIndex,
  disabled,
  annotationRanges,
  onCellClick,
}: Props) {
  const disabledStarts = useMemo(() => new Set(disabled.map((d) => d.start)), [disabled]);

  const annotationAt = (cell: Cell): boolean =>
    annotationRanges.some((r) => {
      if (r.broken) return false;
      const s = cell.srcStart === cell.srcEnd ? cell.srcStart : cell.srcStart;
      return s >= r.start && s < r.end;
    });

  // 按换行切分，保证段落对应清晰。
  const lines: { cell: Cell; index: number }[][] = useMemo(() => {
    const out: { cell: Cell; index: number }[][] = [[]];
    cells.forEach((cell, index) => {
      if (cell.kind === 'newline') {
        out.push([]);
      } else {
        out[out.length - 1].push({ cell, index });
      }
    });
    return out;
  }, [cells]);

  return (
    <div className="braille-pane" aria-label="点字转写结果">
      {lines.map((line, lineNo) => (
        <div className="braille-line" key={lineNo}>
          {line.map(({ cell, index }) => {
            const isDisabledContraction =
              cell.kind === 'contraction' && disabledStarts.has(cell.srcStart);
            const disabledRange =
              cell.disabledWord !== undefined
                ? disabled.find((d) => cell.srcStart >= d.start && cell.srcStart < d.end)
                : undefined;
            const isDisabledLetter = cell.kind === 'letter' && !!disabledRange;
            const classes = ['b-cell', `kind-${cell.kind}`];
            if (highlighted.has(index)) classes.push('mapped');
            if (activeIndex === index) classes.push('active');
            if (isDisabledContraction || isDisabledLetter) classes.push('contraction-off');
            if (annotationAt(cell)) classes.push('has-note');
            return (
              <button
                key={index}
                type="button"
                className={classes.join(' ')}
                title={cell.label}
                onClick={() => onCellClick(index)}
                aria-label={cell.label}
              >
                <span className="b-glyph">{cell.glyph}</span>
                {cell.kind === 'contraction' && !isDisabledContraction && (
                  <span className="b-tag" aria-hidden>缩</span>
                )}
                {isDisabledLetter && cell.srcStart === disabledRange!.start && (
                  <span className="b-tag tag-off" aria-hidden>禁</span>
                )}
                {isDisabledContraction && <span className="b-tag tag-off" aria-hidden>禁</span>}
                {cell.kind === 'unsupported' && (
                  <span className="b-raw" aria-hidden>{cell.rawChar}</span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
