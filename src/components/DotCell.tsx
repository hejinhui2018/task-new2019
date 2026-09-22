import { dotsToUnicode, type DotPattern } from '../braille/dots';
import type { CellKind } from '../braille/transcribe';

interface DotCellProps {
  kind: CellKind;
  dots: DotPattern | null;
  selected: boolean;
  /** 未支持字符时在格内显示的原字符 */
  rawChar?: string;
  note: string;
  onClick: () => void;
}

/**
 * 六点点字格：左列 1/2/3，右列 4/5/6。
 * 视觉网格排列顺序为 1,4 / 2,5 / 3,6。
 */
const GRID_ORDER = [1, 4, 2, 5, 3, 6] as const;

export function DotCell({ kind, dots, selected, rawChar, note, onClick }: DotCellProps) {
  const raised = new Set(dots ?? []);
  const isSpace = kind === 'space';

  return (
    <button
      type="button"
      className={[
        'dot-cell',
        `dot-cell--${kind}`,
        selected ? 'dot-cell--selected' : '',
        isSpace ? 'dot-cell--space' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={note}
      aria-label={note}
      data-cell-kind={kind}
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
    >
      <span className="dot-cell__grid" aria-hidden="true">
        {GRID_ORDER.map((d) => (
          <span key={d} className={raised.has(d) ? 'dot dot--raised' : 'dot'} />
        ))}
      </span>
      {kind === 'unsupported' && <span className="dot-cell__raw">{rawChar}</span>}
      {dots && dots.length > 0 && (
        <span className="dot-cell__unicode" aria-hidden="true">
          {dotsToUnicode(dots)}
        </span>
      )}
    </button>
  );
}
