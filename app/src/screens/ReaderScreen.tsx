// Temporary reader screen: Phase 1 reader B + progress saving. Replaced by the production reader in Phase 3.
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useRef } from 'react'
import { getIssue } from '../data/catalogRepo'
import { saveProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ReaderB } from '../spike/readerB/ReaderB'
import { ErrorBox, Loading, TopBar } from '../ui/components'
import { monthYear } from '../ui/format'
import { useAsync } from '../ui/useAsync'

const SAVE_DEBOUNCE_MS = 800

export function ReaderScreen({ issueId, leaf = 0 }: { issueId: number; leaf?: number }) {
  const { catalog, user } = useDb()
  const nav = useNav()
  const issue = useAsync(() => getIssue(catalog, issueId), [catalog, issueId])
  const pending = useRef<{ page: number; zoom: number } | null>(null)
  const timer = useRef(0)

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    void saveProgress(user, { issueId, page: p.page, offsetX: 0, offsetY: 0, zoom: p.zoom })
  }, [user, issueId])

  const onPage = useCallback((page: number, zoom: number) => {
    pending.current = { page, zoom }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
  }, [flush])

  // save when leaving the screen and when Android pauses the app
  useEffect(() => {
    let remove: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      const h = CapApp.addListener('pause', flush)
      remove = () => void h.then((x) => x.remove())
    }
    return () => {
      remove?.()
      flush()
    }
  }, [flush])

  if (issue.status === 'loading') return <div className="screen"><TopBar /><Loading /></div>
  if (issue.status === 'error' || !issue.data?.iaIdentifier) {
    return <div className="screen"><TopBar /><ErrorBox error={issue.status === 'error' ? issue.error : 'This issue has no scan.'} /></div>
  }
  const i = issue.data
  return (
    <ReaderB issue={{ id: i.iaIdentifier!, label: monthYear(i.year, i.month), storyLeaf: leaf }} startLeaf={leaf}
             onBack={nav.back} onPage={onPage} />
  )
}
