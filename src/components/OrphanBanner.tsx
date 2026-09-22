import type { Orphan } from '../braille/align';

interface OrphanBannerProps {
  orphans: Orphan[];
  onDismiss: () => void;
}

/**
 * 源文编辑导致旧 token 无法在新文本中对应时，明确提示：
 * 批注/禁用标记没有被静默丢弃，而是列在这里等待校对员处理。
 */
export function OrphanBanner({ orphans, onDismiss }: OrphanBannerProps) {
  if (orphans.length === 0) return null;

  return (
    <div className="orphan-banner" role="alert" data-testid="orphan-banner">
      <div className="orphan-banner__head">
        <strong>
          ⚠ {orphans.length} 处批注/缩写禁用无法继续对应到编辑后的文字（已保留，未丢失）
        </strong>
        <button type="button" className="btn" onClick={onDismiss}>
          知道了
        </button>
      </div>
      <ul className="orphan-banner__list">
        {orphans.map((o) => (
          <li key={o.id}>
            <code>{o.kind === 'space' ? '␠' : o.text || '（空）'}</code>
            {o.hadDisabled && <span className="tag">曾禁用缩写</span>}
            {o.annotation && <span className="orphan-banner__note">批注：{o.annotation}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
