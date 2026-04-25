declare module 'virtual:tessera-layout' {
  import type { Component } from 'svelte';
  const layout: Component<{ page: import('svelte').Snippet }> | null;
  export default layout;
}
