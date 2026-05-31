import { describe, it, expect } from 'vitest';
import {
  validateProjectName,
  toTitleCase,
} from '../src/plugin/project-name.js';

describe('validateProjectName', () => {
  it('accepts a valid lowercase slug', () => {
    expect(validateProjectName('my-course')).toBeNull();
  });

  it('requires a non-empty name', () => {
    expect(validateProjectName('')).toBe('Project name is required');
  });

  it('rejects uppercase', () => {
    expect(validateProjectName('MyCourse')).toBe(
      'Project name must be lowercase',
    );
  });

  it('rejects a leading dot or underscore', () => {
    expect(validateProjectName('.hidden')).toContain('start with');
    expect(validateProjectName('_private')).toContain('start with');
  });

  it('rejects illegal characters', () => {
    expect(validateProjectName('my course')).toContain('may only contain');
  });

  it('rejects names longer than 214 chars', () => {
    expect(validateProjectName('a'.repeat(215))).toContain('214');
  });
});

describe('toTitleCase', () => {
  it('title-cases a kebab slug', () => {
    expect(toTitleCase('my-awesome-course')).toBe('My Awesome Course');
  });

  it('splits on dots, underscores, and spaces', () => {
    expect(toTitleCase('a_b.c d')).toBe('A B C D');
  });
});
