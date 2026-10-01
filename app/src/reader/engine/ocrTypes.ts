/** One OCR word: text + normalized box (0..1, origin top-left) + line index within the page. */
export interface OcrWord {
  t: string
  x0: number
  y0: number
  x1: number
  y1: number
  line: number
}

export interface OcrPage {
  w: number
  h: number
  words: OcrWord[]
}
