// Hand a Markdown export to Android's share sheet (save to Files/Drive, mail, Obsidian…). Browser dev: download.
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export async function shareMarkdown(fileName: string, markdown: string, title: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
    a.download = fileName
    a.click()
    URL.revokeObjectURL(a.href)
    return
  }
  const { uri } = await Filesystem.writeFile({ path: `exports/${fileName}`, directory: Directory.Cache, data: markdown,
    encoding: Encoding.UTF8, recursive: true })
  try {
    await Share.share({ title, files: [uri], dialogTitle: 'Export notes' })
  } catch (e) {
    if (!/cancel/i.test(String(e))) throw e // closing the share sheet is not an error
  }
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard?.writeText(text)
}

/** Google search for a selection, in a Chrome tab over the app (Back returns to the page) */
export async function searchWeb(text: string): Promise<void> {
  const q = text.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (q) await Browser.open({ url: `https://www.google.com/search?q=${encodeURIComponent(q)}` })
}
