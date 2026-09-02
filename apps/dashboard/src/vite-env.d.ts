/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_API_BASE_URL?: string;
  }
  interface Window {
    __TESSERRA_API_BASE_URL__?: string;
  }
}

export {};
