declare module 'virtual:tessera-layout' {
  import type { Component } from 'svelte';
  const layout: Component<{ page: import('svelte').Snippet }> | null;
  export default layout;
}

declare module 'virtual:tessera-course-runtime' {
  import type { CourseRuntime } from 'tessera-learn/runtime/types.js';
  const runtime: CourseRuntime | null;
  export default runtime;
}

declare module 'virtual:tessera-adapter' {
  import type { BaseAdapter } from 'tessera-learn/runtime/adapters/base.js';
  import type { CourseConfig } from 'tessera-learn/runtime/types.js';
  export function createAdapter(
    config: CourseConfig,
    options?: { manifest?: unknown; allowFallback?: boolean },
  ): BaseAdapter;
}

declare module 'virtual:tessera-xapi-setup' {
  import type {
    CourseConfig,
    CourseRuntime,
  } from 'tessera-learn/runtime/types.js';
  import type { BaseAdapter } from 'tessera-learn/runtime/adapters/base.js';
  import type { XAPIClient } from 'tessera-learn/runtime/xapi/client.js';
  export function buildXAPIClient(
    config: CourseConfig,
    adapter: BaseAdapter,
    hooks?: CourseRuntime['xapi'],
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

interface Window {
  __tesseraAudit?: {
    goToIndex(index: number): void;
  };
}
