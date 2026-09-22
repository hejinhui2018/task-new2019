import { CONTRACTIONS, LETTER_DOTS, PUNCTUATION_DOTS, dotsToGlyph } from '../braille/rules';

interface Props {
  open: boolean;
  onClose: () => void;
}

const KIND_NAME: Record<string, string> = {
  '.': '句号', ',': '逗号', '?': '问号', '!': '感叹号', ';': '分号', ':': '冒号',
  "'": '撇号', '-': '连字符', '/': '斜杠', '“': '左双引号', '”': '右双引号',
  '(': '左括号', ')': '右括号',
};

export default function RulesModal({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="规则与适用范围">
        <div className="modal-head">
          <h2>规则与适用范围（教学子集）</h2>
          <button className="btn" onClick={onClose}>关闭 ✕</button>
        </div>
        <div className="modal-body">
          <section>
            <h3>点位编号</h3>
            <pre className="dots-diagram">{`1 · · 4
2 · · 5
3 · · 6`}</pre>
            <p>每个点字由六个点位组成，下面统一写作“点 1234”这样的点位串。</p>
          </section>

          <section>
            <h3>字母（26 个）</h3>
            <div className="rule-grid">
              {'abcdefghijklmnopqrstuvwxyz'.split('').map((ch) => (
                <div key={ch} className="rule-chip">
                  <span className="rg-glyph">{dotsToGlyph(LETTER_DOTS[ch])}</span>
                  <span className="rg-text">{ch} · {LETTER_DOTS[ch].join('')}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3>大小写</h3>
            <ul>
              <li><strong>⠠（点 6）大写前缀：</strong>放在大写字母前，一个 ⠠ 表示其后一个字母大写，如 A = ⠠⠁。</li>
              <li><strong>双 ⠠：</strong>连续两个及以上大写字母（整词大写）开头放两个 ⠠，如 THE = ⠠⠠⠹（含缩写）。</li>
            </ul>
          </section>

          <section>
            <h3>数字模式</h3>
            <ul>
              <li><strong>⠼（点 3456）数字前缀：</strong>其后字母 a–j 的字形按 1–0 解释（a=1 … j=0）。</li>
              <li>遇到非数字字符（空格、标点、字母）数字模式立即结束；再次出现数字会重新加 ⠼。</li>
              <li>例：2024 = ⠼⠃⠚⠃⠙，之后遇到逗号即退出数字模式。</li>
            </ul>
          </section>

          <section>
            <h3>常用标点</h3>
            <div className="rule-grid">
              {Object.entries(PUNCTUATION_DOTS).map(([ch, dots]) => (
                <div key={ch} className="rule-chip">
                  <span className="rg-glyph">{dotsToGlyph(dots)}</span>
                  <span className="rg-text">
                    {KIND_NAME[ch] ?? JSON.stringify(ch)} · {dots.join('')}
                  </span>
                </div>
              ))}
            </div>
            <p className="hint">
              教学子集约定：左右括号同为 ⠶（2356），靠位置区分；左双引号 ⠦ 与问号同形，靠上下文区分；
              直引号 " 按相邻字符自动判为左/右引号。
            </p>
          </section>

          <section>
            <h3>五个完整词缩写</h3>
            <p className="hint">仅在<strong>整词边界</strong>（前后都不是字母或数字）命中；Sandy、office、forum 等词内部不会被缩写。</p>
            <table className="contract-table">
              <thead>
                <tr><th>词</th><th>点字</th><th>点位</th><th>适用说明</th></tr>
              </thead>
              <tbody>
                {CONTRACTIONS.map((c) => (
                  <tr key={c.word}>
                    <td className="mono">{c.word}</td>
                    <td className="glyph-lg">{dotsToGlyph(c.dots)}</td>
                    <td className="mono">{c.dots.join('')}</td>
                    <td>{c.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h3>未收录内容</h3>
            <p className="hint">
              本子集不含其它简写词（如 ing、ed、ch、sh 等）、缩写下缀、货币/数学符号等。
              遇到未支持字符时会用红色 <span className="mono">⿽</span> 标出并保留原文，绝不静默丢弃。
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
