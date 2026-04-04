import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig } from './types.js';

export class ProgressState {
  visitedPages = $state(new Set<number>());
  quizScores = $state(new Map<number, number>());
  completionStatus = $state<'incomplete' | 'complete'>('incomplete');
  successStatus = $state<'unknown' | 'passed' | 'failed'>('unknown');

  /**
   * Mark a page as visited. Callers must call recalculateCompletion()
   * afterward to update completionStatus.
   */
  markVisited(pageIndex: number) {
    this.visitedPages = new Set([...this.visitedPages, pageIndex]);
  }

  /**
   * Record a quiz score. Callers must call recalculateCompletion()
   * and recalculateSuccess() afterward to update status fields.
   */
  quizCompleted(pageIndex: number, score: number) {
    this.quizScores = new Map([...this.quizScores, [pageIndex, score]]);
  }

  recalculateCompletion(manifest: Manifest, config: CourseConfig) {
    if (config.completion.mode === 'percentage') {
      const threshold = config.completion.percentageThreshold ?? 100;
      const percent = manifest.totalPages > 0
        ? (this.visitedPages.size / manifest.totalPages) * 100
        : 0;
      this.completionStatus = percent >= threshold ? 'complete' : 'incomplete';
    } else if (config.completion.mode === 'quiz') {
      const gradedIndices = manifest.pages
        .filter(p => p.quiz?.graded)
        .map(p => p.index);

      if (gradedIndices.length === 0) {
        this.completionStatus = 'incomplete';
        return;
      }

      const sum = gradedIndices.reduce(
        (acc, i) => acc + (this.quizScores.get(i) ?? 0),
        0
      );
      const average = sum / gradedIndices.length;
      this.completionStatus = average >= config.scoring.passingScore ? 'complete' : 'incomplete';
    }
  }

  recalculateSuccess(manifest: Manifest, config: CourseConfig) {
    const gradedIndices = manifest.pages
      .filter(p => p.quiz?.graded)
      .map(p => p.index);

    if (gradedIndices.length === 0) {
      this.successStatus = 'unknown';
      return;
    }

    const sum = gradedIndices.reduce(
      (acc, i) => acc + (this.quizScores.get(i) ?? 0),
      0
    );
    const average = sum / gradedIndices.length;
    this.successStatus = average >= config.scoring.passingScore ? 'passed' : 'failed';
  }
}
