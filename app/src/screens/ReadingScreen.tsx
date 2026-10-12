import { Screen, SubMasthead } from '../ui/components'
import { ContinueReading } from './ContinueReading'

/** Issues being read (opened from the "Continue reading" button on the Atlas home). */
export function ReadingScreen() {
  return (
    <Screen masthead={<SubMasthead title="Continue reading" />}>
      <ContinueReading title={null} empty="Nothing in progress. Open any issue and start reading." />
    </Screen>
  )
}
