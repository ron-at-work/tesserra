/// <reference types="vite/client" />

declare global {
  interface Window {
    __ATTEST_API_BASE_URL__?: string;
  }
}

export {};
