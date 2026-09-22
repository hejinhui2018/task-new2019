import { RULE_SECTIONS, SUBSET_LIMITATIONS } from '../braille/rules';

interface RulesPanelProps {
  open: boolean;
  onClose: () => void;
}

export function RulesPanel({ open, onClose }: RulesPanelProps) {
  if (!open) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="规则与适用范围">
      <div className="modal__box">
        <header className="modal__head">
          <h2>规则与适用范围（教学子集）</h2>
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="modal__body">
          <p className="rules__intro">
            点号约定：<strong>1 4 / 2 5 / 3 6</strong> 为从左到右两列、自上而下的六个点位。
            本台仅实现下列教学子集；范围外字符在编辑区中显式标为“未支持”，不会被丢弃。
          </p>
          {RULE_SECTIONS.map((section) => (
            <section key={section.id} className="rules__section">
              <h3>{section.title}</h3>
              <p className="rules__scope">{section.scope}</p>
              <table className="rules__table">
                <thead>
                  <tr>
                    <th>符号 / 词</th>
                    <th>点位</th>
                    <th>说明</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={`${item.symbol}-${item.dots}`}>
                      <td className="rules__symbol">{item.symbol}</td>
                      <td className="rules__dots">{item.dots}</td>
                      <td>{item.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          <section className="rules__section">
            <h3>本教学子集不覆盖的内容</h3>
            <ul className="rules__limits">
              {SUBSET_LIMITATIONS.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
