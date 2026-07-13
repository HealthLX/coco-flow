/// <reference types="vite/client" />
/// <reference types="@testing-library/jest-dom" />

declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}

interface ImportMetaEnv {
  /** Set by `npm run dev:proto` (.env.fixtures) — drives the app from checked-in samples. */
  readonly VITE_COCO_FIXTURES?: string
}
