import { strFromU8, unzipSync } from 'fflate'

const MAX_EXTRACTED_CHARS = 6500
const MAX_PDF_PAGES = 15

export interface ParsedDocumentResult {
  text: string
  highlights: string[]
  estimatedSlides?: number
  charCount: number
  warning?: string
}

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS)
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(Number(dec)))
}

function extractXmlText(xml: string, paragraphTagPattern: RegExp, textTagPattern: RegExp): string {
  const paragraphs = xml.split(paragraphTagPattern)
  const lines: string[] = []
  for (const para of paragraphs) {
    const parts: string[] = []
    let match: RegExpExecArray | null
    const regex = new RegExp(textTagPattern.source, 'g')
    while ((match = regex.exec(para)) !== null) {
      if (match[1]) {
        parts.push(decodeXmlEntities(match[1]))
      }
    }
    const line = parts.join('').replace(/\s+/g, ' ').trim()
    if (line.length > 0) {
      lines.push(line)
    }
  }
  return lines.join('\n')
}

async function extractDocxText(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const files = unzipSync(buf)
  const candidateNames = Object.keys(files)
    .filter(
      (name) =>
        name === 'word/document.xml' ||
        /^word\/header\d*\.xml$/.test(name) ||
        /^word\/footer\d*\.xml$/.test(name),
    )
    .sort((a, b) => (a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b)))

  const sections: string[] = []
  for (const name of candidateNames) {
    const xml = strFromU8(files[name])
    const parsed = extractXmlText(xml, /<\/w:p>/i, /<w:t[^>]*>([\s\S]*?)<\/w:t>/i)
    if (parsed) sections.push(parsed)
  }
  return cleanExtractedText(sections.join('\n'))
}

async function extractPptxText(file: File): Promise<{ text: string; slideCount: number }> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const files = unzipSync(buf)
  const slideNames = Object.keys(files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml/)?.[1] ?? 0)
      const numB = Number(b.match(/slide(\d+)\.xml/)?.[1] ?? 0)
      return numA - numB
    })

  const slideTexts: string[] = []
  for (const name of slideNames.slice(0, 50)) {
    const xml = strFromU8(files[name])
    const parsed = extractXmlText(xml, /<\/a:p>/i, /<a:t[^>]*>([\s\S]*?)<\/a:t>/i)
    if (parsed) slideTexts.push(parsed)
  }
  return {
    text: cleanExtractedText(slideTexts.join('\n')),
    slideCount: slideNames.length,
  }
}

async function extractPdfTextWithPdfJs(file: File): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  }

  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true })
  const pdf = await loadingTask.promise
  const pageCount = pdf.numPages
  const limit = Math.min(pageCount, MAX_PDF_PAGES)
  const pages: string[] = []

  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const strings: string[] = []
    let lastY: number | null = null

    for (const item of content.items) {
      if (!('str' in item)) continue
      const str = (item.str ?? '').trim()
      if (!str) continue
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        strings.push('\n' + str)
      } else {
        strings.push(str)
      }
      if (y !== null) lastY = y
    }
    const pageText = strings.join(' ').replace(/\s*\n\s*/g, '\n').trim()
    if (pageText) pages.push(pageText)
  }

  return {
    text: cleanExtractedText(pages.join('\n\n')),
    pageCount,
  }
}

function extractPdfFallbackRaw(buf: Uint8Array): string {
  const raw = new TextDecoder('latin1').decode(buf)
  const chunks: string[] = []
  const literalRegex = /\(([^()\\]{3,160})\)\s*Tj/g
  let m: RegExpExecArray | null
  while ((m = literalRegex.exec(raw)) !== null) {
    const candidate = m[1].replace(/[^\x20-\x7E\u00C0-\u017F]/g, ' ').trim()
    if (candidate.length >= 3) chunks.push(candidate)
    if (chunks.length >= 250) break
  }
  return cleanExtractedText(chunks.join(' '))
}

export function extractCvHighlights(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•–—]+\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 8 && line.length <= 140)
    .filter((line) => !/^(page \d+|curriculum vitae|resume|cv)$/i.test(line))
    .filter((line) => !/^[\w.+-]+@[\w.-]+\.\w+$/.test(line))

  const prioritized: string[] = []
  const seen = new Set<string>()
  const pushUnique = (item: string) => {
    const key = item.toLowerCase().slice(0, 48)
    if (seen.has(key)) return
    seen.add(key)
    prioritized.push(item.length > 96 ? `${item.slice(0, 93).trimEnd()}…` : item)
  }

  // First pick lines mentioning roles, projects, metrics, or technical skills
  const highSignal =
    /\b(engineer|developer|manager|intern|lead|architect|analyst|research|project|built|designed|led|developed|launched|improved|reduced|increased|react|typescript|python|java|sql|aws|cloud|docker|kubernetes|ml|ai|vr|unity|three|node|api|%|\d+\+)\b/i
  for (const line of lines) {
    if (highSignal.test(line)) {
      pushUnique(line)
      if (prioritized.length >= 6) break
    }
  }

  // Fill remaining slots with early informative lines
  for (const line of lines) {
    if (prioritized.length >= 6) break
    pushUnique(line)
  }

  return prioritized
}

export async function parseUploadedDocument(
  file: File,
  extension: string,
): Promise<ParsedDocumentResult> {
  const ext = extension.toLowerCase()

  try {
    if (ext === 'txt') {
      const text = cleanExtractedText(await file.text())
      return {
        text,
        highlights: extractCvHighlights(text),
        charCount: text.length,
        warning: text.length === 0 ? 'File appears empty.' : undefined,
      }
    }

    if (ext === 'docx') {
      const text = await extractDocxText(file)
      return {
        text,
        highlights: extractCvHighlights(text),
        charCount: text.length,
        warning:
          text.length < 20
            ? 'Very little selectable text was found in this DOCX file.'
            : undefined,
      }
    }

    if (ext === 'pptx') {
      const { text, slideCount } = await extractPptxText(file)
      return {
        text,
        highlights: extractCvHighlights(text),
        estimatedSlides: slideCount || undefined,
        charCount: text.length,
      }
    }

    if (ext === 'pdf') {
      try {
        const { text, pageCount } = await extractPdfTextWithPdfJs(file)
        if (text.length >= 20) {
          return {
            text,
            highlights: extractCvHighlights(text),
            estimatedSlides: pageCount || undefined,
            charCount: text.length,
          }
        }
        return {
          text,
          highlights: extractCvHighlights(text),
          estimatedSlides: pageCount || undefined,
          charCount: text.length,
          warning:
            'No selectable text found (this PDF may be a scanned image). Paste key highlights in the Project Summary box so the AI interviewer can reference them.',
        }
      } catch {
        const rawFallback = extractPdfFallbackRaw(new Uint8Array(await file.arrayBuffer()))
        return {
          text: rawFallback,
          highlights: extractCvHighlights(rawFallback),
          charCount: rawFallback.length,
          warning:
            rawFallback.length < 20
              ? 'Could not extract text from this PDF in browser. You can paste key highlights into the Project Summary box.'
              : undefined,
        }
      }
    }
  } catch {
    return {
      text: '',
      highlights: [],
      charCount: 0,
      warning: 'Unable to parse file contents. You can still paste key points above.',
    }
  }

  return {
    text: '',
    highlights: [],
    charCount: 0,
  }
}
