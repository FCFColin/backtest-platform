// 聚合根层 status 用 'queued'（领域语义更准确，"已入队待执行"），
// DB schema 仍保持 'pending'/'running'/'completed'/'failed'（不破坏迁移），
// repo 层 save() 做 'queued'↔'pending' 映射。
// BacktestCompleted 由 backtest-service 发布（基于结果摘要），
// RunStarted/RunCompleted/RunFailed 由聚合根状态转换触发，更细粒度，两者并行存在。

import { randomUUID } from 'crypto';
import { DomainValidationError } from '../errors.js';
import type { DomainEvent } from '../events/events.js';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

const TERMINAL_STATES: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'cancelled']);

export interface RunProps {
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
  skipInitialEvent?: boolean;
}

/**
 * 不变量：
 * 1. 终态（completed/failed/cancelled）后不可再转换状态
 * 2. complete() 仅 running 态可调用
 * 3. fail() 仅 running 态可调用
 * 4. cancel() 仅 queued/running 态可调用
 */
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
  private readonly _events: DomainEvent[] = [];

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

  /** 初始 status='queued'，产生 RunStarted 事件。 */
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
    if (!props.skipInitialEvent) {
      run.pushRunEvent('RunStarted', {
        name: run.name,
        portfolioId: run.portfolioId,
        ownerUserId: run.ownerUserId,
      });
    }
    return run;
  }

  /** 仅 repo 层使用：从持久化行重建聚合根（不产生事件）。 */
  static fromRow(props: RunProps): Run {
    return new Run({ ...props, skipInitialEvent: true });
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

  /** queued → running。设 startedAt。 */
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

  /** running → completed。设 completedAt + result，产生 RunCompleted 事件。 */
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
    this.pushRunEvent('RunCompleted', {
      name: this.name,
      portfolioId: this.portfolioId,
      ownerUserId: this.ownerUserId,
    });
  }

  /** running → failed。设 failureReason + completedAt，产生 RunFailed 事件。 */
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
    this.pushRunEvent('RunFailed', {
      name: this.name,
      portfolioId: this.portfolioId,
      ownerUserId: this.ownerUserId,
      failureReason: reason,
    });
  }

  /** queued|running → cancelled。设 completedAt，产生 RunCancelled 事件。 */
  cancel(): void {
    if (TERMINAL_STATES.has(this._status)) {
      throw new DomainValidationError(
        `Run cannot cancel from terminal status '${this._status}'`,
        'status',
        this._status,
      );
    }
    this._status = 'cancelled';
    this._completedAt = new Date();
    this.pushRunEvent('RunCancelled', {
      name: this.name,
      portfolioId: this.portfolioId,
      ownerUserId: this.ownerUserId,
    });
  }

  private pushRunEvent(eventType: string, payload: Record<string, unknown>): void {
    this._events.push({
      eventType,
      aggregateType: 'Run',
      aggregateId: this.id,
      payload,
      occurredAt: this._completedAt ?? new Date(),
    });
  }

  /**
   * 调用者应在持久化聚合根后调用此方法，将事件交给 eventDispatcher 分发。
   * 取出后清空内部缓存。
   */
  pullEvents(): DomainEvent[] {
    const events = [...this._events];
    this._events.length = 0;
    return events;
  }

  /** 导出供测试断言。 */
  static newEventId(): string {
    return randomUUID();
  }
}
