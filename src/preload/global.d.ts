import type { HellApi } from './index'

declare global {
  interface Window {
    api: HellApi
  }
}
