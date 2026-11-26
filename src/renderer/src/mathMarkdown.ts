/**
 * Claude often writes a displayed equation as `$$...$$` on one line, which remark-math reads as
 * inline math. Put the fences on lines of their own so it displays.
 */
export function displayMath(md: string): string {
  return md.replace(/^([ \t]*)\$\$(.+?)\$\$[ \t]*$/gm, (_m, indent: string, tex: string) => `${indent}$$\n${indent}${tex.trim()}\n${indent}$$`)
}
