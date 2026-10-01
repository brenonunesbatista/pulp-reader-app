// OCR parsing off the main thread (5 MB of XML would block page turns).
import { parseDjvuXml } from './djvuXml'

self.onmessage = (e: MessageEvent<string>) => {
  ;(self as unknown as Worker).postMessage(parseDjvuXml(e.data))
}
