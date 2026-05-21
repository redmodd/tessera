import { describe, it, expect } from 'vitest';
import { resolveAsset } from '../src/components/util.js';

describe('resolveAsset', () => {
  it('rewrites the $assets/ prefix to a document-relative path', () => {
    expect(resolveAsset('$assets/img/logo.png')).toBe('./assets/img/logo.png');
    expect(resolveAsset('$assets/audio.mp3')).toBe('./assets/audio.mp3');
  });

  it('only rewrites the leading prefix, not later occurrences', () => {
    expect(resolveAsset('$assets/a/$assets/b.png')).toBe('./assets/a/$assets/b.png');
  });

  it('passes through absolute and external URLs unchanged', () => {
    expect(resolveAsset('/assets/x.png')).toBe('/assets/x.png');
    expect(resolveAsset('./assets/x.png')).toBe('./assets/x.png');
    expect(resolveAsset('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
    expect(resolveAsset('https://youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it('handles nullish input without throwing', () => {
    expect(resolveAsset(undefined as unknown as string)).toBe(undefined);
    expect(resolveAsset(null as unknown as string)).toBe(null);
    expect(resolveAsset('')).toBe('');
  });
});
