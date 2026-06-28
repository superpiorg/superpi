import type { SuperpiAPI } from '@shared/types'

declare global {
  interface Window {
    superpi: SuperpiAPI
  }
}

export {}
