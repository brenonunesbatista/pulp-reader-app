// Brightness + immersive mode via the local native plugin (android/.../BancaDisplayPlugin.java).
// Browser dev: no-ops (the reader dims with an overlay instead, see ReaderScreen).
import { Capacitor, registerPlugin } from '@capacitor/core'

interface BancaDisplay {
  setBrightness(o: { value: number | null }): Promise<void>
  setImmersive(o: { on: boolean }): Promise<{ on: boolean }>
}

const plugin = registerPlugin<BancaDisplay>('BancaDisplay')
export const nativeDisplay = Capacitor.isNativePlatform()

export async function setBrightness(value: number | null): Promise<void> {
  if (nativeDisplay) await plugin.setBrightness({ value }).catch(() => undefined)
}

export async function setImmersive(on: boolean): Promise<void> {
  if (nativeDisplay) await plugin.setImmersive({ on }).catch(() => undefined)
}
