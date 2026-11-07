import { describe, it, expect } from 'vitest';
import { slugFromQuestion } from '../src/components/util.js';

describe('slugFromQuestion', () => {
  it('produces a stable slug across calls for the same input', () => {
    const a = slugFromQuestion('What is 2 + 2?');
    const b = slugFromQuestion('What is 2 + 2?');
    expect(a).toBe(b);
    expect(a).toBe('what-is-2-2');
  });

  it('lowercases, replaces non-alphanumerics with single dashes, trims edges', () => {
    expect(slugFromQuestion('  Hello, World!! ')).toBe('hello-world');
  });

  it('cuts at 40 characters without a trailing dash', () => {
    expect(slugFromQuestion('a'.repeat(100))).toBe('a'.repeat(40));
    expect(slugFromQuestion(`${'a'.repeat(39)} b`)).toBe('a'.repeat(39));
    expect(
      slugFromQuestion('Did the attack succeed against the fortified wall?'),
    ).toBe('did-the-attack-succeed-against-the-forti');
  });

  it('spells Latin letters without accents, then adds a hash of the prompt', () => {
    expect(slugFromQuestion('Café?')).toBe('cafe-1htl0nt');
    expect(slugFromQuestion('Café?')).toBe('cafe-1htl0nt');
    expect(slugFromQuestion('Résumé')).toBe('resume-vvv8cq');
    expect(slugFromQuestion('Straße')).toBe('strasse-1mfnvn');
    expect(slugFromQuestion('What’s up — “really”?')).toBe(
      'what-s-up-really-15riyb7',
    );
  });

  it('keeps prompts that differ only by accents distinct', () => {
    expect(slugFromQuestion('Que signifie pêche ?')).toBe(
      'que-signifie-peche-ou08uj',
    );
    expect(slugFromQuestion('Que signifie péché ?')).toBe(
      'que-signifie-peche-nt80ro',
    );
  });

  it('hashes prompts ASCII cannot spell', () => {
    expect(slugFromQuestion('東京は？')).toBe('1u6y6gm');
    expect(slugFromQuestion('大阪は？')).toBe('gvmrai');
    expect(slugFromQuestion('What is Г?')).toBe('what-is-1qd7kqh');
    expect(slugFromQuestion('👍 or 👎?')).toBe('or-1w5mneo');
    expect(slugFromQuestion('⭐⭐⭐?')).toBe('10g4s5k');
    expect(slugFromQuestion('¿…?')).toBe('ftvqrp');
  });

  it('hashes after the 40-character cut', () => {
    expect(
      slugFromQuestion(
        'Which one of these is the capital of Japan? 東京 or 大阪?',
      ),
    ).toBe('which-one-of-these-is-the-capital-of-jap-1bhx245');
  });

  it('handles nullish input without throwing', () => {
    expect(slugFromQuestion(undefined)).toBe('');
    expect(slugFromQuestion(null)).toBe('');
  });

  it('matches the id prefixes the four built-in question components emit', () => {
    // Each component prefixes the slug with its widget kind and uses the
    // result as the registerQuestion id when the author omits `id`. The
    // contract: same `question` text → same slug body across components,
    // so SCORM/cmi5 interaction records key consistently.
    const slug = slugFromQuestion('Pick the capital of France');
    expect(`mc-${slug}`).toBe('mc-pick-the-capital-of-france');
    expect(`fitb-${slug}`).toBe('fitb-pick-the-capital-of-france');
    expect(`matching-${slug}`).toBe('matching-pick-the-capital-of-france');
    expect(`sorting-${slug}`).toBe('sorting-pick-the-capital-of-france');
  });
});
