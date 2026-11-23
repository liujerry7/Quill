// Finds the to-dos in a page's transcript: anything labelled TODO.
//
//   TODO: email the TA            -> "email the TA"
//   - [ ] **TODO** finish lab 3   -> "finish lab 3"
//   ## TODO                       -> each list item under the heading, up to a blank line or the
//   - read chapter 4                 next heading: "read chapter 4", "do problem set"
//   - do problem set
//
// "To-do" and "todo" count too. "Things to do" doesn't: it needs the one word.

const LABEL = /\bto-?do\b\s*[:\-–—]?\s*/i
const NAME_MAX = 120

/** Trims list markers, checkboxes, emphasis and stray punctuation from a to-do's text. */
function clean(text: string): string {
  return text
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '') // list marker
    .replace(/^\[[ xX]?\]\s*/, '') // checkbox
    .replace(/(\*\*|__|\*|_|~~|`)/g, '') // emphasis
    .replace(/^[\s:\-–—]+|[\s:\-–—]+$/g, '')
    .trim()
}

/** The to-dos written on a page, in order, without repeats. */
export function findTodos(markdown: string): string[] {
  const found: string[] = []
  const lines = markdown.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = LABEL.exec(line)
    if (!match) continue
    const rest = clean(line.slice(match.index + match[0].length))
    if (rest) {
      found.push(rest)
      continue
    }
    // A bare "TODO" label (a heading, or a line of its own): the list items under it are the to-dos.
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (!next.trim()) {
        if (j === i + 1) continue // a blank line straight after the label is fine
        break
      }
      if (/^\s*#/.test(next)) break
      if (!/^\s*(?:[-*+]|\d+[.)])\s+/.test(next)) break
      const item = clean(next)
      if (item) found.push(item)
      i = j
    }
  }
  const seen = new Set<string>()
  return found
    .map((t) => (t.length > NAME_MAX ? `${t.slice(0, NAME_MAX - 1).trimEnd()}…` : t))
    .filter((t) => {
      const key = todoKey(t)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** Two to-dos are the same if they differ only in case, spacing or a trailing full stop. */
export function todoKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim()
}
