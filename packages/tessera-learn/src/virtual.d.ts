declare module 'virtual:tessera-layout' {
  import type { Component } from 'svelte';
  const layout: Component<{ page: import('svelte').Snippet }> | null;
  export default layout;
}

declare module 'virtual:tessera-adapter' {
  import type { PersistenceAdapter } from 'tessera-learn/runtime/persistence.js';
  import type { CourseConfig } from 'tessera-learn/runtime/types.js';
  export function createAdapter(config: CourseConfig): PersistenceAdapter;
}

declare module 'virtual:tessera-xapi-setup' {
  import type { CourseConfig } from 'tessera-learn/runtime/types.js';
  import type { PersistenceAdapter } from 'tessera-learn/runtime/persistence.js';
  import type { XAPIClient } from 'tessera-learn/runtime/xapi/client.js';
  export function buildXAPIClient(
    config: CourseConfig,
    adapter: PersistenceAdapter,
  ): Promise<XAPIClient | null>;
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
