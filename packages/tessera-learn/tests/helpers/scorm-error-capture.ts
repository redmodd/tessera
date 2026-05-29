import type { Scorm12API } from 'scorm-again/scorm12';
import type { Scorm2004API } from 'scorm-again/scorm2004';

export interface CapturedError {
  key: string;
  code: string;
}

type GetLastErrorFn = () => string;

export function createErrorCapture(
  getLastError: GetLastErrorFn,
  errors: CapturedError[],
) {
  return (key: string, ret: string) => {
    const code = getLastError();
    if (ret !== 'true' || code !== '0') errors.push({ key, code });
  };
}

export function createScorm12ErrorCapture(raw: Scorm12API, errors: CapturedError[]) {
  return createErrorCapture(() => raw.LMSGetLastError(), errors);
}

export function createScorm2004ErrorCapture(raw: Scorm2004API, errors: CapturedError[]) {
  return createErrorCapture(() => raw.GetLastError(), errors);
}
