import type { IdToken } from '../braille/align';
import type { BrailleCell } from '../braille/transcribe';

interface ProofingPanelProps {
  token: IdToken | null;
  cells: BrailleCell[];
  annotation: string;
  disabled: boolean;
  canContract: boolean;
  onAnnotationChange: (value: string) => void;
  onToggleDisable: () => void;
}

const KIND_LABEL: Record<IdToken['kind'], string> = {
  word: '字母词',
  number: '数字串',
  punct: '标点',
  space: '空白',
  unsupported: '未支持字符',
};

export function ProofingPanel({
  token,
  cells,
  annotation,
  disabled,
  canContract,
  onAnnotationChange,
  onToggleDisable,
}: ProofingPanelProps) {
  if (!token) {
    return (
      <aside className="proofing" aria-label="校对面板">
        <h2 className="panel__title">校对面板</h2>
        <p className="proofing__hint">
          点击右侧任一点字（含大写号、数字号前缀），或在左侧拖选源文，即可定位对应内容并在此逐词校对。
        </p>
      </aside>
    );
  }

  return (
    <aside className="proofing" aria-label="校对面板">
      <h2 className="panel__title">校对面板</h2>
      <dl className="proofing__meta">
        <dt>当前词/符</dt>
        <dd>
          <span className="proofing__word">{token.kind === 'space' ? '␠（空白）' : token.text}</span>
          <span className="proofing__kind">{KIND_LABEL[token.kind]}</span>
        </dd>
        <dt>点字构成</dt>
        <dd>
          <ul className="proofing__cells">
            {cells.map((c) => (
              <li key={c.seq}>{c.note}</li>
            ))}
          </ul>
        </dd>
      </dl>

      {token.kind === 'word' && canContract && (
        <label className="proofing__disable">
          <input
            type="checkbox"
            checked={disabled}
            onChange={onToggleDisable}
            data-testid="disable-contraction"
          />
          禁用本词缩写（恢复逐字母拼写）
        </label>
      )}
      {token.kind === 'word' && !canContract && (
        <p className="proofing__note">该词不在 5 个完整词缩写表内，始终逐字母拼写。</p>
      )}

      <label className="proofing__annotation-label" htmlFor="annotation-input">
        批注（挂在本词身份上，编辑前后不漂移）
      </label>
      <textarea
        id="annotation-input"
        className="proofing__annotation"
        value={annotation}
        rows={4}
        placeholder="例如：此处缩写点字与字母 p 同点位，注意区分……"
        onChange={(e) => onAnnotationChange(e.target.value)}
      />
    </aside>
  );
}
