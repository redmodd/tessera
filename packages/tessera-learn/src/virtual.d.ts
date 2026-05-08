declare module 'virtual:tessera-layout' {
  import type { Component } from 'svelte';
  const layout: Component<{ page: import('svelte').Snippet }> | null;
  export default layout;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
