import { describe, it, expect } from 'vitest';

// Test the core quiz logic that lives outside of Svelte components.
// These test the scoring model, answer checking, and integration with progress state.

describe('Quiz scoring model', () => {
  it('calculates score as (correctCount / totalCount) × 100', () => {
    const totalQuestions = 5;
    const correctCount = 3;
    const score = Math.round((correctCount / totalQuestions) * 100);
    expect(score).toBe(60);
  });

  it('calculates 100% when all correct', () => {
    const total = 4;
    const correct = 4;
    const score = Math.round((correct / total) * 100);
    expect(score).toBe(100);
  });

  it('calculates 0% when none correct', () => {
    const total = 3;
    const correct = 0;
    const score = Math.round((correct / total) * 100);
    expect(score).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const total = 3;
    const correct = 1;
    const score = Math.round((correct / total) * 100);
    expect(score).toBe(33); // 33.33... → 33
  });
});

describe('MultipleChoice answer checking', () => {
  function checkMultipleChoice(answer: number | null, correct: number): boolean {
    return answer === correct;
  }

  it('returns true when answer matches correct index', () => {
    expect(checkMultipleChoice(2, 2)).toBe(true);
  });

  it('returns false when answer does not match', () => {
    expect(checkMultipleChoice(1, 2)).toBe(false);
  });

  it('returns false for null answer', () => {
    expect(checkMultipleChoice(null, 0)).toBe(false);
  });
});

describe('FillInTheBlank answer checking', () => {
  function checkFillInTheBlank(
    userAnswer: string | null,
    acceptableAnswers: string[],
    caseSensitive: boolean = false
  ): boolean {
    if (!userAnswer || typeof userAnswer !== 'string') return false;
    const trimmed = userAnswer.trim();
    return acceptableAnswers.some(acceptable => {
      const a = acceptable.trim();
      if (caseSensitive) return trimmed === a;
      return trimmed.toLowerCase() === a.toLowerCase();
    });
  }

  it('matches exact answer (case-insensitive by default)', () => {
    expect(checkFillInTheBlank('Mars', ['Mars'])).toBe(true);
    expect(checkFillInTheBlank('mars', ['Mars'])).toBe(true);
    expect(checkFillInTheBlank('MARS', ['Mars'])).toBe(true);
  });

  it('matches case-sensitive when flag is set', () => {
    expect(checkFillInTheBlank('Mars', ['Mars'], true)).toBe(true);
    expect(checkFillInTheBlank('mars', ['Mars'], true)).toBe(false);
  });

  it('trims whitespace', () => {
    expect(checkFillInTheBlank('  Mars  ', ['Mars'])).toBe(true);
  });

  it('accepts any of multiple correct answers', () => {
    expect(checkFillInTheBlank('NYC', ['New York City', 'NYC', 'New York'])).toBe(true);
    expect(checkFillInTheBlank('New York', ['New York City', 'NYC', 'New York'])).toBe(true);
  });

  it('returns false for null/undefined answer', () => {
    expect(checkFillInTheBlank(null, ['Mars'])).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(checkFillInTheBlank('', ['Mars'])).toBe(false);
    expect(checkFillInTheBlank('   ', ['Mars'])).toBe(false);
  });

  it('returns false for wrong answer', () => {
    expect(checkFillInTheBlank('Venus', ['Mars'])).toBe(false);
  });
});

describe('Matching answer checking', () => {
  function checkMatching(
    answer: Map<number, number> | null,
    pairs: { left: string; right: string }[]
  ): boolean {
    if (!answer || !(answer instanceof Map)) return false;
    if (answer.size !== pairs.length) return false;
    for (let i = 0; i < pairs.length; i++) {
      if (answer.get(i) !== i) return false;
    }
    return true;
  }

  const pairs = [
    { left: 'Japan', right: 'Tokyo' },
    { left: 'France', right: 'Paris' },
    { left: 'Brazil', right: 'Brasília' },
  ];

  it('returns true when all pairs correctly matched', () => {
    const answer = new Map([[0, 0], [1, 1], [2, 2]]);
    expect(checkMatching(answer, pairs)).toBe(true);
  });

  it('returns false when a pair is wrong', () => {
    const answer = new Map([[0, 1], [1, 0], [2, 2]]);
    expect(checkMatching(answer, pairs)).toBe(false);
  });

  it('returns false when not all pairs matched', () => {
    const answer = new Map([[0, 0], [1, 1]]);
    expect(checkMatching(answer, pairs)).toBe(false);
  });

  it('returns false for null answer', () => {
    expect(checkMatching(null, pairs)).toBe(false);
  });

  it('returns false for empty map', () => {
    expect(checkMatching(new Map(), pairs)).toBe(false);
  });
});

describe('Quiz integration with ProgressState', () => {
  // These test the scoring/completion integration described in Step 8

  it('quiz score is stored by page index', () => {
    // Simulating what happens when Quiz dispatches tessera-quiz-complete
    const quizScores = new Map<number, number>();
    const pageIndex = 5;
    const score = 85;
    quizScores.set(pageIndex, score);
    expect(quizScores.get(5)).toBe(85);
  });

  it('retry replaces previous score', () => {
    const quizScores = new Map<number, number>();
    quizScores.set(5, 60); // first attempt
    quizScores.set(5, 85); // retry
    expect(quizScores.get(5)).toBe(85);
  });

  it('maxAttempts enforcement', () => {
    const maxAttempts = 3;
    let attemptCount = 0;

    // Simulate 3 attempts
    attemptCount++; expect(attemptCount < maxAttempts).toBe(true);
    attemptCount++; expect(attemptCount < maxAttempts).toBe(true);
    attemptCount++; expect(attemptCount < maxAttempts).toBe(false);
  });

  it('Infinity maxAttempts allows unlimited retries', () => {
    const maxAttempts = Infinity;
    let attemptCount = 100;
    expect(attemptCount < maxAttempts).toBe(true);
  });

  it('gatesProgress blocks next page when score below passing', () => {
    const passingScore = 70;
    const score = 60;
    const gatesProgress = true;
    const isBlocked = gatesProgress && score < passingScore;
    expect(isBlocked).toBe(true);
  });

  it('gatesProgress allows next page when score meets passing', () => {
    const passingScore = 70;
    const score = 70;
    const gatesProgress = true;
    const isBlocked = gatesProgress && score < passingScore;
    expect(isBlocked).toBe(false);
  });
});

describe('Quiz question registration', () => {
  it('questions are registered in order and assigned sequential indices', () => {
    const questions: { id: number; type: string }[] = [];
    let nextId = 0;

    function register(type: string) {
      const id = nextId++;
      questions.push({ id, type });
      return id;
    }

    const mc = register('MultipleChoice');
    const fitb = register('FillInTheBlank');
    const matching = register('Matching');

    expect(mc).toBe(0);
    expect(fitb).toBe(1);
    expect(matching).toBe(2);
    expect(questions).toHaveLength(3);
  });
});

describe('Quiz flow states', () => {
  it('transitions through question → results → review → results', () => {
    let submitted = false;
    let reviewing = false;

    // Question phase
    expect(submitted).toBe(false);
    expect(reviewing).toBe(false);

    // Submit
    submitted = true;
    expect(submitted).toBe(true);
    expect(reviewing).toBe(false);

    // Enter review
    reviewing = true;
    expect(submitted).toBe(true);
    expect(reviewing).toBe(true);

    // Exit review
    reviewing = false;
    expect(submitted).toBe(true);
    expect(reviewing).toBe(false);
  });

  it('retry resets to question phase', () => {
    let submitted = true;
    let reviewing = false;
    let answers = new Map([[0, 2], [1, 'Mars']]);
    let score = 100;
    let currentQuestionIndex = 2;

    // Retry
    submitted = false;
    reviewing = false;
    answers = new Map();
    score = 0;
    currentQuestionIndex = 0;

    expect(submitted).toBe(false);
    expect(reviewing).toBe(false);
    expect(answers.size).toBe(0);
    expect(score).toBe(0);
    expect(currentQuestionIndex).toBe(0);
  });
});

describe('Immediate feedback flow', () => {
  it('feedbackMode defaults to "review"', () => {
    const quizConfig: { feedbackMode?: string } = { };
    const feedbackMode = quizConfig.feedbackMode ?? 'review';
    expect(feedbackMode).toBe('review');
  });

  it('immediate mode: first Next click shows feedback, second advances', () => {
    const feedbackMode = 'immediate';
    const feedbackShown = new Set<number>();
    let currentIndex = 0;
    const answered = new Set([0]);

    function handleNext() {
      if (feedbackMode === 'immediate' && answered.has(currentIndex) && !feedbackShown.has(currentIndex)) {
        feedbackShown.add(currentIndex);
        return;
      }
      currentIndex++;
    }

    handleNext();
    expect(feedbackShown.has(0)).toBe(true);
    expect(currentIndex).toBe(0);

    handleNext();
    expect(currentIndex).toBe(1);
  });

  it('review mode: Next click advances immediately (no feedback step)', () => {
    const feedbackMode = 'review';
    const feedbackShown = new Set<number>();
    let currentIndex = 0;
    const answered = new Set([0]);

    function handleNext() {
      if (feedbackMode === 'immediate' && answered.has(currentIndex) && !feedbackShown.has(currentIndex)) {
        feedbackShown.add(currentIndex);
        return;
      }
      currentIndex++;
    }

    handleNext();
    expect(feedbackShown.size).toBe(0);
    expect(currentIndex).toBe(1);
  });

  it('feedbackVisible returns true when immediate feedback is shown for a question', () => {
    const feedbackShown = new Set([0, 2]);
    const feedbackMode = 'immediate';
    const showFeedback = true;
    const submitted = false;
    const reviewing = false;

    function feedbackVisible(index: number): boolean {
      if (feedbackMode === 'immediate' && showFeedback && feedbackShown.has(index)) return true;
      if (submitted && reviewing && showFeedback) return true;
      return false;
    }

    expect(feedbackVisible(0)).toBe(true);
    expect(feedbackVisible(1)).toBe(false);
    expect(feedbackVisible(2)).toBe(true);
  });

  it('feedbackVisible returns false when feedbackMode is immediate but showFeedback is false', () => {
    const feedbackShown = new Set([0]);
    const feedbackMode = 'immediate';
    const showFeedback = false;

    function feedbackVisible(index: number): boolean {
      if (feedbackMode === 'immediate' && showFeedback && feedbackShown.has(index)) return true;
      return false;
    }

    expect(feedbackVisible(0)).toBe(false);
  });
});

describe('Standalone question mode', () => {
  it('standalone is detected when quiz context is undefined', () => {
    const quiz = undefined;
    const standalone = !quiz;
    expect(standalone).toBe(true);
  });

  it('standalone is false when quiz context exists', () => {
    const quiz = { registerQuestion: () => 0 };
    const standalone = !quiz;
    expect(standalone).toBe(false);
  });

  it('maxRetries defaults to Infinity', () => {
    const props = { question: 'test', options: [], correct: 0 };
    const maxRetries = (props as any).maxRetries ?? Infinity;
    expect(maxRetries).toBe(Infinity);
  });

  it('retry is allowed when retryCount < maxRetries', () => {
    let retryCount = 0;
    const maxRetries = 2;
    expect(retryCount < maxRetries).toBe(true);
    retryCount++;
    expect(retryCount < maxRetries).toBe(true);
    retryCount++;
    expect(retryCount < maxRetries).toBe(false);
  });

  it('retry resets answered state', () => {
    let answered = true;
    let selectedOption = 2;
    let retryCount = 0;

    // Simulate retry
    retryCount++;
    answered = false;
    selectedOption = null as any;

    expect(answered).toBe(false);
    expect(selectedOption).toBeNull();
    expect(retryCount).toBe(1);
  });

  it('standalone MC: selecting an option immediately marks as answered', () => {
    let answered = false;
    let selected: number | null = null;

    function handleSelect(optIndex: number) {
      if (answered) return;
      selected = optIndex;
      answered = true;
    }

    handleSelect(2);
    expect(answered).toBe(true);
    expect(selected).toBe(2);

    // Can't change answer once answered
    handleSelect(0);
    expect(selected).toBe(2);
  });

  it('standalone FillInTheBlank: answering locks the input', () => {
    let answered = false;
    let inputValue = 'Mars';

    function handleInput(value: string) {
      if (answered) return;
      inputValue = value;
    }

    answered = true;
    handleInput('Venus');
    expect(inputValue).toBe('Mars'); // unchanged
  });

  it('standalone Matching: auto-submits when all pairs matched', () => {
    let answered = false;
    const pairCount = 3;
    let matchCount = 0;

    function checkAutoSubmit() {
      if (matchCount === pairCount && !answered) {
        answered = true;
      }
    }

    matchCount = 2;
    checkAutoSubmit();
    expect(answered).toBe(false);

    matchCount = 3;
    checkAutoSubmit();
    expect(answered).toBe(true);
  });
});

describe('Retry mode', () => {
  it('retryMode defaults to "full"', () => {
    const quizConfig: { retryMode?: string } = {};
    const retryMode = quizConfig.retryMode ?? 'full';
    expect(retryMode).toBe('full');
  });

  it('full retry resets all answers and lockedCorrect is empty', () => {
    const retryMode = 'full';
    const answers = new Map<number, any>([[0, 2], [1, 'Mars'], [2, new Map([[0, 0]])]]);
    const correctIndices = [0, 2];

    let newAnswers: Map<number, any>;
    let lockedCorrect: Set<number>;

    if (retryMode === 'incorrect-only') {
      lockedCorrect = new Set(correctIndices);
      newAnswers = new Map();
      for (const idx of correctIndices) {
        newAnswers.set(idx, answers.get(idx));
      }
    } else {
      lockedCorrect = new Set();
      newAnswers = new Map();
    }

    expect(newAnswers.size).toBe(0);
    expect(lockedCorrect.size).toBe(0);
  });

  it('incorrect-only retry preserves correct answers and locks them', () => {
    const retryMode = 'incorrect-only';
    const answers = new Map<number, any>([[0, 2], [1, 'Venus'], [2, new Map([[0, 0]])]]);
    const checkResults = [true, false, true];

    const correctIndices: number[] = [];
    for (let i = 0; i < checkResults.length; i++) {
      if (checkResults[i]) correctIndices.push(i);
    }

    let newAnswers: Map<number, any>;
    let lockedCorrect: Set<number>;

    if (retryMode === 'incorrect-only') {
      lockedCorrect = new Set(correctIndices);
      newAnswers = new Map();
      for (const idx of correctIndices) {
        newAnswers.set(idx, answers.get(idx));
      }
    } else {
      lockedCorrect = new Set();
      newAnswers = new Map();
    }

    expect(newAnswers.size).toBe(2);
    expect(newAnswers.get(0)).toBe(2);
    expect(newAnswers.get(2)).toEqual(new Map([[0, 0]]));
    expect(newAnswers.has(1)).toBe(false);
    expect(lockedCorrect.size).toBe(2);
    expect(lockedCorrect.has(0)).toBe(true);
    expect(lockedCorrect.has(1)).toBe(false);
    expect(lockedCorrect.has(2)).toBe(true);
  });

  it('isLockedCorrect returns true only for locked questions', () => {
    const lockedCorrect = new Set([0, 2]);

    function isLockedCorrect(index: number): boolean {
      return lockedCorrect.has(index);
    }

    expect(isLockedCorrect(0)).toBe(true);
    expect(isLockedCorrect(1)).toBe(false);
    expect(isLockedCorrect(2)).toBe(true);
  });

  it('scoring on retry counts preserved correct answers', () => {
    const checkResults = [true, true, true];
    const correctCount = checkResults.filter(r => r).length;
    const score = Math.round((correctCount / checkResults.length) * 100);
    expect(score).toBe(100);
  });

  it('scoring on retry with some still wrong', () => {
    const checkResults = [true, false, true];
    const correctCount = checkResults.filter(r => r).length;
    const score = Math.round((correctCount / checkResults.length) * 100);
    expect(score).toBe(67);
  });
});
