/** 内置示例段落：含五个整词缩写、年份（数字模式）、大写词、整词大写与“词中假缩写”。 */

export const SAMPLE_TEXT = `In 2024, THE Braille Club and the readers of the press met for a day with volunteers. Anna and Sandy found the office forum; The date 1829 marks the end of the year!`;

export interface SampleAnnotation {
  start: number;
  end: number;
  text: string;
}

/** 示例批注的偏移在首次加载时按文本动态计算，避免手写偏移出错。 */
export function sampleAnnotations(): SampleAnnotation[] {
  const year = SAMPLE_TEXT.indexOf('2024');
  const sandy = SAMPLE_TEXT.indexOf('Sandy');
  return [
    {
      start: year,
      end: year + 4,
      text: '年份：先出数字前缀 ⠼，随后 2/0/2/4 复用 b/j/b/d 四个点字；逗号使数字模式结束。',
    },
    {
      start: sandy,
      end: sandy + 5,
      text: 'Sandy 内部虽含 “and”，但它不是整词，必须逐字母书写，不能用缩写 ⠯。',
    },
  ];
}
