import { describe, it, expect } from 'vitest';
import { parseArgs, validateProjectName, toTitleCase } from '../src/index.ts';

describe('parseArgs', () => {
  it('returns help when --help is passed', () => {
    expect(parseArgs(['--help'])).toEqual({ help: true });
    expect(parseArgs(['-h'])).toEqual({ help: true });
  });

  it('defaults the template to "default"', () => {
    expect(parseArgs(['my-course']).args).toEqual({
      projectName: 'my-course',
      template: 'default',
    });
  });

  it('accepts --template=bare', () => {
    expect(parseArgs(['my-course', '--template=bare']).args).toEqual({
      projectName: 'my-course',
      template: 'bare',
    });
  });

  it('rejects unknown templates', () => {
    expect(parseArgs(['x', '--template=fancy']).error).toMatch(
      /Unknown template/,
    );
  });

  it('rejects unknown flags', () => {
    expect(parseArgs(['--version']).error).toMatch(/Unknown option/);
  });

  it('rejects multiple positional arguments', () => {
    expect(parseArgs(['a', 'b']).error).toMatch(/Unexpected argument/);
  });
});

describe('validateProjectName', () => {
  it('accepts valid names', () => {
    expect(validateProjectName('my-course')).toBeNull();
    expect(validateProjectName('my_course')).toBeNull();
    expect(validateProjectName('course.v2')).toBeNull();
    expect(validateProjectName('a')).toBeNull();
  });

  it('rejects empty names', () => {
    expect(validateProjectName('')).toMatch(/required/);
  });

  it('rejects uppercase', () => {
    expect(validateProjectName('MyCourse')).toMatch(/lowercase/);
  });

  it('rejects names that do not start with a letter or digit', () => {
    expect(validateProjectName('-leading-dash')).toMatch(/start with/);
    expect(validateProjectName('.leading-dot')).toMatch(/start with/);
    expect(validateProjectName('_leading-underscore')).toMatch(/start with/);
  });

  it('rejects disallowed characters', () => {
    expect(validateProjectName('with space')).toMatch(/may only contain/);
    expect(validateProjectName('with/slash')).toMatch(/may only contain/);
    expect(validateProjectName('with@at')).toMatch(/may only contain/);
  });

  it('rejects names longer than 214 characters', () => {
    expect(validateProjectName('a'.repeat(215))).toMatch(/214/);
    expect(validateProjectName('a'.repeat(214))).toBeNull();
  });
});

describe('toTitleCase', () => {
  it('splits on dashes, underscores, dots, and whitespace', () => {
    expect(toTitleCase('my-awesome-course')).toBe('My Awesome Course');
    expect(toTitleCase('my_course')).toBe('My Course');
    expect(toTitleCase('course.v2')).toBe('Course V2');
    expect(toTitleCase('a b c')).toBe('A B C');
  });

  it('drops empty segments from runs of separators', () => {
    expect(toTitleCase('foo--bar')).toBe('Foo Bar');
  });

  it('titlecases validated names to characters safe to embed unescaped', () => {
    const names = [
      'my-course',
      'my_course',
      'course.v2',
      'a.b-c_d',
      '1course',
      'x',
    ];
    for (const n of names) {
      expect(validateProjectName(n)).toBeNull();
      expect(toTitleCase(n)).toMatch(/^[A-Za-z0-9 ]*$/);
    }
  });
});
