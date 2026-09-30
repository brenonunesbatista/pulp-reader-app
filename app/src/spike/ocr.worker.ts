// Parses IA `_djvu.xml` with regexes (DOMParser is not available in workers and is slow on 5 MB).
// <OBJECT ... height="H" ... width="W"> ... <LINE> <WORD coords="left,bottom,right,top[,baseline]">text</WORD>
import type { OcrPage, OcrWord } from './ocrTypes'

const OBJECT_RE = /<OBJECT\b([^>]*)>([\s\S]*?)<\/OBJECT>/g
const LINE_RE = /<LINE>([\s\S]*?)<\/LINE>/g
const WORD_RE = /<WORD coords="(\d+),(\d+),(\d+),(\d+)[^"]*"[^>]*>([^<]*)<\/WORD>/g

function attr(attrs: string, name: string): number {
  const m = new RegExp(`\\b${name}="(\\d+)"`).exec(attrs)
  return m ? Number(m[1]) : 0
}

function unescape(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

self.onmessage = (e: MessageEvent<string>) => {
  const xml = e.data
  const pages: OcrPage[] = []
  for (const obj of xml.matchAll(OBJECT_RE)) {
    const w = attr(obj[1], 'width')
    const h = attr(obj[1], 'height')
    const words: OcrWord[] = []
    let line = 0
    for (const ln of obj[2].matchAll(LINE_RE)) {
      for (const wd of ln[1].matchAll(WORD_RE)) {
        const t = unescape(wd[5]).trim()
        if (!t) continue
        const left = Number(wd[1]), bottom = Number(wd[2]), right = Number(wd[3]), top = Number(wd[4])
        words.push({ t, x0: left / w, y0: top / h, x1: right / w, y1: bottom / h, line })
      }
      line++
    }
    pages.push({ w, h, words })
  }
  ;(self as unknown as Worker).postMessage(pages)
}
