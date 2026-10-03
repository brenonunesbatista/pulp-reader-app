import { describe, expect, it } from 'vitest'
import { folderOf } from '../downloads/store'
import { coverUrl } from '../ui/format'
import { parseScandata } from './engine/ia'
import { packPageSvc, scanParts, sizedImageUrl } from './engine/scan'

const ITEM = 'dungeon-magazine'
const STEM = 'Dungeon Magazine # 1 - Roger E. Moore [editor]'

describe('pack issues (Phase 8b)', () => {
  it('splits scan keys', () => {
    expect(scanParts('Galaxy_v01n01_1950-10')).toEqual({ item: 'Galaxy_v01n01_1950-10', stem: 'Galaxy_v01n01_1950-10', pack: false })
    expect(scanParts(`${ITEM}/${STEM}`)).toEqual({ item: ITEM, stem: STEM, pack: true })
  })

  it('builds page images inside the pack: IIIF, or BookReader pages for names IIIF cannot serve', () => {
    const plain = 'Dungeon Magazine 220 - Christopher Perkins [editor]'
    expect(packPageSvc(ITEM, plain, 7, 5)).toBe('https://iiif.archive.org/image/iiif/3/' + encodeURIComponent(
      `${ITEM}/${plain}_jp2.zip/${plain}_jp2/${plain}_0007.jp2`))
    expect(sizedImageUrl(packPageSvc(ITEM, plain, 7, 5), 400, 3000)).toMatch(/0007\.jp2\/full\/400,\/0\/default\.jpg$/)
    expect(sizedImageUrl(packPageSvc(ITEM, STEM, 7, 5), 400, 3000)).toBe(
      `https://archive.org/download/${ITEM}/page/n5_w400.jpg?subPrefix=${encodeURIComponent(STEM)}`)
    expect(sizedImageUrl(packPageSvc(ITEM, STEM, 7, 5), 9999, 3000)).toContain('n5_w3000.jpg')
    expect(coverUrl(`ia:${ITEM}/${STEM}`)).toBe(`https://archive.org/download/${ITEM}/page/n0_w200.jpg?subPrefix=${encodeURIComponent(STEM)}`)
  })

  it('reads the page list from scandata, skipping pages not in the access formats', () => {
    const xml = `<book><pageData>
      <page leafNum="0"><pageType>Cover</pageType><addToAccessFormats>true</addToAccessFormats>
        <origWidth>3301</origWidth><origHeight>2550</origHeight><cropBox><x>0</x><y>0</y><w>3200</w><h>2500</h></cropBox></page>
      <page leafNum="1"><pageType>Color Card</pageType><addToAccessFormats>false</addToAccessFormats>
        <origWidth>10</origWidth><origHeight>10</origHeight></page>
      <page leafNum="2"><pageType>Normal</pageType><addToAccessFormats>true</addToAccessFormats>
        <origWidth>3054</origWidth><origHeight>3966</origHeight></page>
    </pageData></book>`
    expect(parseScandata(xml, ITEM, STEM)).toEqual([
      { w: 3200, h: 2500, svc: packPageSvc(ITEM, STEM, 0, 0) },
      { w: 3054, h: 3966, svc: packPageSvc(ITEM, STEM, 2, 1) },
    ])
  })

  it('keeps plain identifiers as folder names and flattens pack keys', () => {
    expect(folderOf('Galaxy_v01n01_1950-10')).toBe('Galaxy_v01n01_1950-10')
    expect(folderOf(`${ITEM}/${STEM}`)).toBe('dungeon-magazine__Dungeon_Magazine_1_-_Roger_E._Moore_editor_')
  })
})
