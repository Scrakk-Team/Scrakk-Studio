export { tabsStore } from './store'
export type { TabsEvent } from './store'
export {
  welcomeTab,
  panelTab,
  fileTab,
  terminalTab,
  explorerTab,
  tabPersistsByDefault
} from './store'
export { TabStrip, MAX_STRIP_ACTIONS, type StripAction } from './TabStrip'
export type { TabKind, TabSpec, StripId, StripState } from './types'
export {
  tabHeaderKey,
  setTabHeader,
  getTabHeader,
  subscribeTabHeaders,
  extractHeaderMenuItems,
  _resetTabHeadersForTests,
  type TabHeaderEntry
} from './tabHeaders'
