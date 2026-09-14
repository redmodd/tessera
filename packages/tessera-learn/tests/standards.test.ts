import { describe, it, expect } from 'vitest';
import {
  STANDARDS,
  largerSuspendDataStandards,
  standardProfile,
} from '../src/runtime/standards.js';

describe('standardProfile', () => {
  it('returns the profile for a known id', () => {
    expect(standardProfile('cmi5')).toBe(STANDARDS.cmi5);
  });

  it('returns undefined outside the table', () => {
    expect(standardProfile(undefined)).toBeUndefined();
    expect(standardProfile('unknown')).toBeUndefined();
    expect(standardProfile('toString')).toBeUndefined();
  });
});

describe('largerSuspendDataStandards', () => {
  it('lists packaged standards with a larger or no suspend-data limit', () => {
    expect(largerSuspendDataStandards(4096)).toEqual([
      'scorm2004',
      'cmi5',
      'xapi',
    ]);
    expect(largerSuspendDataStandards(64000)).toEqual(['cmi5', 'xapi']);
  });
});
