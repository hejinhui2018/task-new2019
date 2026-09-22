import { describe, expect, it, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import { SAMPLE_PARAGRAPH } from '../braille/sample';

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

function sourceTextarea() {
  return screen.getByLabelText('源文编辑区') as HTMLTextAreaElement;
}

function andCells() {
  return screen.getAllByRole('button', { name: /整个单词 .and. 缩写为一个点字/ });
}

describe('应用：转写校对台', () => {
  it('打开即显示示例源文与点字，缩写词在点字区只占一个点字', () => {
    render(<App />);
    expect(sourceTextarea().value).toBe(SAMPLE_PARAGRAPH);
    // 示例中有两个 and，每个都只渲染一个缩写点字按钮
    expect(andCells()).toHaveLength(2);
    // 年份 2024 存在数字号
    expect(screen.getAllByRole('button', { name: /数字号/ }).length).toBeGreaterThan(0);
    // 全大写词 BBC 存在全大写词号
    expect(screen.getByRole('button', { name: /全大写词号/ })).toBeTruthy();
  });

  it('点击点字反选源文：and 缩写点字对应源文区间 [8,11)', () => {
    render(<App />);
    fireEvent.click(andCells()[0]);
    const ta = sourceTextarea();
    expect(ta.selectionStart).toBe(8);
    expect(ta.selectionEnd).toBe(11);
    expect(ta.value.slice(8, 11)).toBe('and');
    // 校对面板显示该词与点字构成
    expect(document.querySelector('.proofing__word')?.textContent).toBe('and');
    expect(screen.getByText(/完整词缩写/)).toBeTruthy();
  });

  it('选原文定位点字：拖选 and 区间后对应点字词组高亮', () => {
    render(<App />);
    const ta = sourceTextarea();
    ta.focus();
    ta.setSelectionRange(8, 11);
    fireEvent.select(ta);
    // token 序号：The0 空1 BBC2 空3 and4
    const group = document.querySelector('[data-token-index="4"]')!;
    expect(group.classList.contains('braille-word--active')).toBe(true);
  });

  it('一个字母多个点字：大写 B 对应大写号+字母，两个点字同时高亮', () => {
    render(<App />);
    const ta = sourceTextarea();
    // BBC 中第一个 B 在偏移 4
    ta.setSelectionRange(4, 5);
    fireEvent.select(ta);
    const group = document.querySelector('[data-token-index="2"]')!;
    const cells = within(group as HTMLElement).getAllByRole('button');
    expect(cells[0]).toHaveAttribute('aria-label', expect.stringContaining('全大写词号'));
  });

  it('逐词禁用缩写后该词恢复逐字母拼写，重新勾选恢复缩写', () => {
    render(<App />);
    fireEvent.click(andCells()[0]);
    const checkbox = screen.getByTestId('disable-contraction') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);
    // 第一个 and 不再是缩写点字（只剩另一个 and）
    expect(andCells()).toHaveLength(1);
    // 词内出现三个字母点字
    const group = document.querySelector('[data-token-index="4"]')!;
    const letters = within(group as HTMLElement).getAllByRole('button', { name: /字母 [aand]/ });
    expect(letters.length).toBeGreaterThanOrEqual(3);
    // 恢复
    fireEvent.click(checkbox);
    expect(andCells()).toHaveLength(2);
  });

  it('批注随词身份保留：在文首插入内容后，原 and 上的批注不漂移', () => {
    render(<App />);
    fireEvent.click(andCells()[0]);
    fireEvent.change(screen.getByLabelText('批注（挂在本词身份上，编辑前后不漂移）'), {
      target: { value: '核对 and 缩写' },
    });

    // 在文首插入 "XX "
    const ta = sourceTextarea();
    fireEvent.change(ta, { target: { value: 'XX ' + SAMPLE_PARAGRAPH } });

    // 第一个 and 仍是原身份：点它，批注还在
    fireEvent.click(andCells()[0]);
    const note = screen.getByDisplayValue('核对 and 缩写');
    expect(note).toBeTruthy();
  });

  it('词被删除无法对应时出现明确提示，撤销后恢复', () => {
    render(<App />);
    // with 在示例中唯一
    const withCell = screen.getByRole('button', { name: /整个单词 .with. 缩写为一个点字/ });
    fireEvent.click(withCell);
    fireEvent.change(screen.getByLabelText('批注（挂在本词身份上，编辑前后不漂移）'), {
      target: { value: 'with 的批注' },
    });

    // 替换成完全不同的文字
    fireEvent.change(sourceTextarea(), { target: { value: 'nothing here' } });
    const banner = screen.getByTestId('orphan-banner');
    expect(banner.textContent).toContain('with');
    expect(banner.textContent).toContain('with 的批注');

    // 撤销恢复文字与批注
    fireEvent.click(screen.getByRole('button', { name: /撤销/ }));
    expect(sourceTextarea().value).toBe(SAMPLE_PARAGRAPH);
    expect(screen.queryByTestId('orphan-banner')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /整个单词 .with. 缩写为一个点字/ }));
    expect(screen.getByDisplayValue('with 的批注')).toBeTruthy();
  });

  it('支持 Ctrl+Z / Ctrl+Shift+Z 撤销重做', () => {
    render(<App />);
    fireEvent.change(sourceTextarea(), { target: { value: 'hello' } });
    expect(sourceTextarea().value).toBe('hello');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(sourceTextarea().value).toBe(SAMPLE_PARAGRAPH);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(sourceTextarea().value).toBe('hello');
  });

  it('未支持字符被显式标出并计数，不被丢弃', () => {
    render(<App />);
    fireEvent.change(sourceTextarea(), { target: { value: 'a#b' } });
    expect(screen.getByTestId('unsupported-count').textContent).toContain('1');
    const bad = document.querySelector('[data-cell-kind="unsupported"]')!;
    expect(bad.textContent).toContain('#');
  });

  it('规则面板可查看子集范围与限制', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '规则与适用范围' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('完整词缩写（5 个）');
    expect(dialog.textContent).toContain('数字模式');
    expect(dialog.textContent).toContain('本教学子集不覆盖的内容');
  });

  it('刷新恢复：重新挂载后文字与批注从 localStorage 还原', () => {
    const { unmount } = render(<App />);
    fireEvent.click(andCells()[0]);
    fireEvent.change(screen.getByLabelText('批注（挂在本词身份上，编辑前后不漂移）'), {
      target: { value: '持久化批注' },
    });
    unmount();

    render(<App />);
    expect(sourceTextarea().value).toBe(SAMPLE_PARAGRAPH);
    fireEvent.click(andCells()[0]);
    expect(screen.getByDisplayValue('持久化批注')).toBeTruthy();
  });
});
