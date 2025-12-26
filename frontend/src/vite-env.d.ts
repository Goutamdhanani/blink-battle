/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_APP_ID: string
  readonly VITE_PLATFORM_WALLET_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
