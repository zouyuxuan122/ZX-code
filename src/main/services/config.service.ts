import Store from 'electron-store'

interface WindowState {
  width: number
  height: number
  x: number | undefined
  y: number | undefined
  isMaximized: boolean
}

interface AppConfig {
  windowState: WindowState
  activeProjectId: string | null
}

const store = new Store<AppConfig>({
  defaults: {
    windowState: {
      width: 1400,
      height: 900,
      x: undefined,
      y: undefined,
      isMaximized: false,
    },
    activeProjectId: null,
  },
})

export const config = {
  getWindowState: (): WindowState => store.get('windowState'),
  setWindowState: (state: WindowState): void => store.set('windowState', state),
  
  getActiveProjectId: (): string | null => store.get('activeProjectId'),
  setActiveProjectId: (id: string | null): void => store.set('activeProjectId', id),
}
