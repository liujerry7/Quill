import Anthropic from '@anthropic-ai/sdk'
import type { ReadResult } from '../shared/read'

const MODEL = 'claude-opus-5-5'

const SYSTEM = `You transcribe handwritten notes from an image into clean Markdown.

- Keep the writer's structure: headings for titles, bullets or numbered lists for lists, paragraphs for prose.
- Write math as LaTeX: $...$ inline, $$...$$ on its own line for displayed equations.
- Transcribe what is written, fixing only obvious spelling slips. Don't add content, summaries or commentary.
- If a word is illegible, write your best guess followed by [?].
- Ignore crossed-out text and stray marks. Describe a drawing or diagram in one italic line, e.g. *[diagram: arrow from A to B]*.
- Reply with the Markdown only.`

// The key stays in the main process; the renderer only ever sees the transcription.
let client: Anthropic | null = null
function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) return null
  client ??= new Anthropic({ apiKey })
  return client
}

export async function readInk(pngBase64: string): Promise<ReadResult> {
  const anthropic = getClient()
  if (!anthropic) {
    return { ok: false, error: 'No ANTHROPIC_API_KEY yet. Use "Open .env" at the top of the window to add it, then restart.' }
  }

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // If Opus declines on a safety classifier, the API reruns the request on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
            { type: 'text', text: 'Transcribe these handwritten notes.' },
          ],
        },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return { ok: false, error: 'Claude declined to read this ink.' }
    }
    const markdown = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim()
    if (response.stop_reason === 'max_tokens') {
      return { ok: true, markdown: `${markdown}\n\n*[transcription cut off: try reading a smaller selection]*` }
    }
    return { ok: true, markdown }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'Anthropic rejected the API key in .env.' }
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'Rate limited by Anthropic. Wait a moment and try again.' }
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `Anthropic API error ${err.status ?? ''}: ${err.message}` }
    }
    return { ok: false, error: `Couldn't reach Anthropic: ${(err as Error).message}` }
  }
}
