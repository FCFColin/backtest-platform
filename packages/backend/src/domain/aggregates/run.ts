import { DomainValidationError } from '../value-objects/index.js';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

const TERMINAL_STATES: ReadonlySet<RunStatus> = new Set(['completed', 'failed']);

interface RunProps {
  id: string;
  portfolioId?: string;
  name?: string | null;
  request: unknown;
  result?: unknown | null;
  status: RunStatus;
  startedAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  ownerUserId?: string | null;
}

export class Run {
  public readonly id: string;
  public readonly portfolioId?: string;
  public readonly name?: string | null;
  public readonly ownerUserId?: string | null;
  private _status: RunStatus;
  private readonly _request: unknown;
  private _result?: unknown | null;
  private _startedAt?: Date;
  private _completedAt?: Date;
  private _failureReason?: string;

  private constructor(props: RunProps) {
    this.id = props.id;
    this.portfolioId = props.portfolioId;
    this.name = props.name;
    this.ownerUserId = props.ownerUserId ?? null;
    this._status = props.status;
    this._request = props.request;
    this._result = props.result ?? null;
    this._startedAt = props.startedAt;
    this._completedAt = props.completedAt;
    this._failureReason = props.failureReason;
  }

  static create(props: Omit<RunProps, 'status'> & Partial<Pick<RunProps, 'status'>>): Run {
    const run = new Run({
      id: props.id,
      portfolioId: props.portfolioId,
      name: props.name,
      request: props.request,
      result: props.result ?? null,
      status: props.status ?? 'queued',
      startedAt: props.startedAt,
      completedAt: props.completedAt,
      failureReason: props.failureReason,
      ownerUserId: props.ownerUserId,
    });
    return run;
  }

  get status(): RunStatus {
    return this._status;
  }

  get request(): unknown {
    return this._request;
  }

  get result(): unknown | null {
    return this._result ?? null;
  }

  get startedAt(): Date | undefined {
    return this._startedAt;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  get failureReason(): string | undefined {
    return this._failureReason;
  }

  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this._status);
  }

  start(): void {
    if (this._status !== 'queued') {
      throw new DomainValidationError(
        `Run cannot start from status '${this._status}' (expected 'queued')`,
        'status',
        this._status,
      );
    }
    this._status = 'running';
    this._startedAt = new Date();
  }

  complete(result: unknown): void {
    if (this._status !== 'running') {
      throw new DomainValidationError(
        `Run cannot complete from status '${this._status}' (expected 'running')`,
        'status',
        this._status,
      );
    }
    this._status = 'completed';
    this._result = result;
    this._completedAt = new Date();
  }

  fail(reason: string): void {
    if (this._status !== 'running') {
      throw new DomainValidationError(
        `Run cannot fail from status '${this._status}' (expected 'running')`,
        'status',
        this._status,
      );
    }
    this._status = 'failed';
    this._failureReason = reason;
    this._completedAt = new Date();
  }
}
