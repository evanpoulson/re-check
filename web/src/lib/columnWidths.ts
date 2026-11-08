/** Smallest width for two lines of intact chips in their original order. */
export function twoLineWidth(widths: number[], gap: number): number {
  const span = (items: number[]) => items.reduce((total, width) => total + width, 0) + Math.max(0, items.length - 1) * gap
  let best = span(widths)
  for (let split = 1; split < widths.length; split++) {
    best = Math.min(best, Math.max(span(widths.slice(0, split)), span(widths.slice(split))))
  }
  return best
}
