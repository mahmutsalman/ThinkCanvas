/// <reference types="vite/client" />

interface Window {
  MonacoEnvironment?: {
    getWorker: (workerId: string, label: string) => Worker
  }
  app: {
    platform: string
  }
  // Viewer !color theme bridge — pushed from the Electron main process when the
  // daemon writes stream-color.json. onChange returns an unsubscribe fn.
  streamColor?: {
    onChange: (
      cb: (data: {
        hex?: string
        name?: string
        reset?: boolean
        durationMs?: number | null
      }) => void
    ) => () => void
  }
}
