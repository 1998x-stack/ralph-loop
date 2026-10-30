export type RunStatus = 'created' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type StoryStatus = 'pending' | 'running' | 'verifying' | 'retryable' | 'passed' | 'blocked';
export type AttemptStatus = 'created' | 'running' | 'implementation_ready' | 'verifying' | 'passed' | 'failed' | 'timed_out' | 'cancelled';
export interface StorySpec {
  id: string;
  passes: boolean; // legacy claim only, never an acceptance gate
  status?: string;
  priority?: number;
  dependencies?: string[];
  [key: string]: unknown;
}
export interface AttemptState {
  id: string;
  storyId: string;
  status: AttemptStatus;
  startedAt: string;
  updatedAt?: string;
  evidencePath?: string;
  failureReason?: string;
}
export interface StoryState { status: StoryStatus; attempts: number; updatedAt: string }
export interface RunState {
  schemaVersion: 2;
  runId: string;
  status: RunStatus;
  prdHash: string;
  manifestHash: string;
  createdAt: string;
  updatedAt: string;
  stories: Record<string,StoryState>;
  attempts: AttemptState[];
}
export interface VerificationCheck {
  id: string;
  command: string;
  args: string[];
  storyIds?: string[];
  timeoutSeconds?: number;
}
export interface VerificationManifest {
  version: 1;
  checks: VerificationCheck[];
  protectedPaths?: string[];
}
export interface CheckResult {
  id: string;
  passed: boolean;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  error: string | null;
}
export interface EvaluationVerdict { storyId: string; passed: boolean; reasons: string[]; checks: Array<{id: string; passed: boolean}> }
