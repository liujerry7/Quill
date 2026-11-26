import Anthropic from '@anthropic-ai/sdk'
import type { CheckMark, ImageSize, ReadResult } from '../shared/read'

const MODEL = 'claude-opus-5-5'

const SYSTEM = `You transcribe handwritten notes from an image into clean Markdown.

- Keep the writer's structure: headings for titles, bullets or numbered lists for lists, paragraphs for prose.
- Write math as LaTeX: $...$ inline, $$...$$ on its own line for displayed equations.
- Transcribe what is written, fixing only obvious spelling slips. Don't add content, summaries or commentary.
- If a word is illegible, write your best guess followed by [?].
- The ink's colour says what kind of writing it is:
  - Black (or dark grey): notes and practice problems. Transcribe as above.
  - Green: to-dos. Write each task as its own line "TODO: <the task>", even if the word TODO isn't written. Quill turns these lines into to-dos, so one task per line.
  - Red: the writer's own questions, ideas, guesses and thoughts. Write each as a blockquote labelled with what it is, e.g. "> **Question:** why is the determinant multiplicative?" (labels: Question, Idea, Guess, Thought). Put it right after the note it sits beside.
  - Anything labelled as a to-do (TODO, todo, To do, a boxed "TODO") is a to-do whatever its colour.
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

// ---- checking worked problems ----------------------------------------------------------

const CHECK_SYSTEM = `You check handwritten math, like a good tutor marking it. The image is an area of a page of handwritten notes that the writer boxed to be checked: a problem (or a few) and their own working.

The writer draws a box round their final answer (a hand-drawn outline round it). Take the boxed expression as their final answer. If nothing is boxed, take the last line of working as the answer and say so in the verdict. If the problem statement isn't in the area, infer it from the working and say what you took it to be.

Problems run up to university calculus and differential equations from standard textbooks: limits, derivatives, integrals (substitution, parts, partial fractions, trig substitution), series, separable, linear, exact and Bernoulli first-order ODEs, second-order linear ODEs (constant coefficients, undetermined coefficients, variation of parameters), Laplace transforms, systems, initial value problems.

Before judging, work each problem out yourself, independently and carefully, so your verdict rests on your own solution and not on theirs. Verify your own answer: differentiate an antiderivative, substitute a solution back into the equation and its initial conditions, check a limit numerically. Then go through their work step by step against it.

An answer equivalent to the correct one is correct. Before calling an answer wrong, check whether it differs only by:
- the arbitrary constant (C, 2C, -C, e^C, ln|C|, a constant absorbed into another),
- a trig, log or exponential identity, or partial fractions combined or not,
- implicit vs explicit form of a solution, or factored vs expanded.

Common mistakes to look for: a missing constant of integration or one applied wrongly with an initial condition; solutions lost by dividing (like y = 0); a missing absolute value in a logarithm; sign errors; the chain rule; a wrong integrating factor; mishandled repeated or complex characteristic roots; a particular solution guess that overlaps the homogeneous solution; the interval of validity.

The ink's colour means something: black (or dark grey) is notes and working, green is to-dos, red is the writer's own questions, ideas, guesses and thoughts. Red dashed boxes and red notes in a neat hand are not theirs: ignore them.

If the area has a problem but no attempt at it, or just a "?" where the working would be, the writer doesn't know how to do it at all. Don't mark it: teach it. Then "feedback" is, instead of the sections below:

### Verdict
**❓ Not attempted:** one sentence naming the kind of problem and the method that solves it.

### Walkthrough
Solve it step by step as a patient tutor would, for someone seeing this kind of problem for the first time: say why each step is the next one before doing it, show the working in full, and name any rule or formula as you use it. End with the answer, and check it (differentiate it back, substitute it in).

### Key idea
Two or three sentences on how to recognise this kind of problem and the method to reach for, so they can do the next one.

For such a problem, "marks" has one mark of kind "help" on the "?" (or beside the problem if there's no "?"), with the note "see walkthrough".

Your reply has two parts, "feedback" and "marks".

"feedback" is Markdown, with these sections for each problem (under "## Problem 1", "## Problem 2"… if there's more than one):

### Verdict
One of **✅ Correct**, **⚠️ Partly correct**, **❌ Incorrect** or **❓ Can't tell**, then one sentence. Give their final answer and the correct one.

### What went right
Bullets, each pointing at a specific step or idea of theirs: a correct setup, a good method, clean algebra. Not generic praise.

### What went wrong
The first mistake first: quote or describe the line, say exactly what's wrong and why, and show the correct step. Then any later mistakes, saying which are new and which only carry the earlier one forward. If nothing is wrong, say "Nothing: the work is correct." A valid but unusual method is not a mistake; a missing justification the problem asks for is.

### Correct solution
Only if the work isn't fully correct: a short worked solution, in their notation where you can, one step per line.

### Your questions
Only if red ink asks something: answer each briefly.

Rules for the feedback:
- Write math as LaTeX: $...$ inline, and $$...$$ for a displayed equation with each $$ on a line of its own.
- Be direct and specific. Honest about errors, never invent one, and don't pad.
- If part of the page is illegible, say which part and judge the rest.
- If there's no problem with an attempt on the page, say so in a sentence and stop.

"marks" are what a tutor writes on the page itself in red pen: one per mistake (kind "wrong"), at the place it's written, and one on each correct final answer (kind "right"). At most 8.
- box: [x0, y0, x1, y1], the pixel coordinates in the image (its size is given below it) of a box around just the wrong expression or line (or the correct answer), measured from the top-left corner: x0, y0 its top-left, x1, y1 its bottom-right. Fit it closely round the writing.
- note: a margin note of a few words, plain text with no LaTeX, like "subtract 3: 2x = 8". Empty for a correct answer.
- correction: one sentence on what's wrong and the fix (Markdown, LaTeX math). Empty for a correct answer.
- transcriptLine: the line of the page's transcript (given below the image) where this mistake or answer appears, copied character for character. Empty if it isn't there.`

const CHECK_SCHEMA = {
  type: 'object',
  properties: {
    feedback: { type: 'string' },
    marks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['wrong', 'right', 'help'] },
          box: { type: 'array', items: { type: 'number' } },
          note: { type: 'string' },
          correction: { type: 'string' },
          transcriptLine: { type: 'string' },
        },
        required: ['kind', 'box', 'note', 'correction', 'transcriptLine'],
        additionalProperties: false,
      },
    },
  },
  required: ['feedback', 'marks'],
  additionalProperties: false,
}

/** The marks that make sense (four numbers, corners in order), boxes turned from pixels into 0–1000. */
function cleanMarks(raw: unknown, size: ImageSize): CheckMark[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((m): CheckMark[] => {
    const box: number[] = Array.isArray(m?.box) ? m.box.map(Number) : []
    if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) return []
    const fx = (n: number) => Math.min(1000, Math.max(0, (n / size.width) * 1000))
    const fy = (n: number) => Math.min(1000, Math.max(0, (n / size.height) * 1000))
    const [x0, y0, x1, y1] = [fx(box[0]), fy(box[1]), fx(box[2]), fy(box[3])]
    if (x1 <= x0 || y1 <= y0) return []
    return [
      {
        kind: m.kind === 'right' || m.kind === 'help' ? m.kind : 'wrong',
        box: [x0, y0, x1, y1],
        note: String(m.note ?? '').slice(0, 80),
        correction: String(m.correction ?? ''),
        transcriptLine: String(m.transcriptLine ?? ''),
      },
    ]
  })
}

type CheckFeedback = { ok: true; markdown: string; marks: CheckMark[] } | { ok: false; error: string }

export async function checkWork(pngBase64: string, transcript: string, size: ImageSize): Promise<CheckFeedback> {
  const anthropic = getClient()
  if (!anthropic) {
    return { ok: false, error: 'No ANTHROPIC_API_KEY yet. Use "Open .env" at the top of the window to add it, then restart.' }
  }

  try {
    // Checking is reasoning, not just reading: think first, and stream, since that can take a while.
    const response = await anthropic.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: 'adaptive', display: 'omitted' },
        // Calculus and ODEs need real working out, so Claude gets room to think it through.
        output_config: { effort: 'xhigh', format: { type: 'json_schema', schema: CHECK_SCHEMA } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: CHECK_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
              {
                type: 'text',
                text: `Check my work in this area. The image is ${size.width} × ${size.height} pixels.\n\nThe page's transcript:\n<transcript>\n${transcript.trim() || '(none yet)'}\n</transcript>`,
              },
            ],
          },
        ],
      })
      .finalMessage()

    if (response.stop_reason === 'refusal') {
      return { ok: false, error: 'Claude declined to check this page.' }
    }
    if (response.stop_reason === 'max_tokens') {
      return { ok: false, error: 'The feedback ran too long. Try boxing one problem at a time.' }
    }
    const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
    let parsed: { feedback?: unknown; marks?: unknown }
    try {
      parsed = JSON.parse(text)
    } catch {
      return { ok: false, error: "Claude's feedback came back garbled. Try again." }
    }
    return { ok: true, markdown: String(parsed.feedback ?? '').trim(), marks: cleanMarks(parsed.marks, size) }
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
