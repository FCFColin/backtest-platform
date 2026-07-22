// DDD: Run Aggregate — 回测运行事务边界 + 状态机
//
// 充血模型：Run 聚合根封装了回测运行的状态机（queued→running→completed/failed/cancelled）
// 与领域事件发布。worker / 同步路径均通过此聚合根驱动状态转换，避免散落的状态赋值。
//
// 与 repositories/backtestRunRepo 的关系：
//   - 聚合根层 status 用 'queued'（领域语义更准确，"已入队待执行"）
//   - DB schema 仍保持 'pending'/'running'/'completed'/'failed'（不破坏迁移）
//   - repo 层 save() 做 'queued'↔'pending' 映射
//
// 与 BacktestCompleted 事件的关系：
//   - BacktestCompleted 由 backtest-service 发布（基于结果摘要）
//   - RunStarted/RunCompleted/RunFailed 由聚合根状态转换触发，更细粒度
//   - 两者并行存在，不互相替代

import { randomUUID } from 'crypto';
import { DomainValidationError } from '../errors.js';
import type { DomainEvent } from '../events/EventDispatcher.js';

/** Run 聚合根状态（领域语义） */
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** 终态集合——再 transition 抛错 */
const TERMINAL_STATES: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'cancelled']);

/** Run 聚合根属性 */
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
  /** 仅 repo 层 fromRow / 测试构造时使用，绕过 RunStarted 事件 */
  skipInitialEvent?: boolean;
}

/**
 * 回测运行聚合根。
 *
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

  /**
   * 创建 Run 聚合根（初始 status='queued'，产生 RunStarted 事件）。
   *
   * @param props - 必填 id/request；可选 portfolioId/name/ownerUserId
   * @returns 新建的 Run 聚合根（queued 态）
   */
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
      run._events.push({
        eventType: 'RunStarted',
        aggregateType: 'Run',
        aggregateId: run.id,
        payload: {
          name: run.name,
          portfolioId: run.portfolioId,
          ownerUserId: run.ownerUserId,
        },
        occurredAt: new Date(),
      });
    }
    return run;
  }

  /** 从持久化行重建聚合根（不产生事件）。仅 repo 层使用。 */
  static fromRow(props: RunProps): Run {
    return new Run({ ...props, skipInitialEvent: true });
  }

  /** 当前状态 */
  get status(): RunStatus {
    return this._status;
  }

  /** 请求快照 */
  get request(): unknown {
    return this._request;
  }

  /** 计算结果（completed 时填充） */
  get result(): unknown | null {
    return this._result ?? null;
  }

  /** 开始时间 */
  get startedAt(): Date | undefined {
    return this._startedAt;
  }

  /** 完成时间（completed/failed/cancelled 时填充） */
  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  /** 失败原因（failed 时填充） */
  get failureReason(): string | undefined {
    return this._failureReason;
  }

  /** 是否终态 */
  get isTerminal(): boolean {
    return TERMINAL_STATES.has(this._status);
  }

  /**
   * queued → running。设 startedAt。
   *
   * @throws {DomainValidationError} 当 status 非 queued 时
   */
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

  /**
   * running → completed。设 completedAt + result，产生 RunCompleted 事件。
   *
   * @param result - 计算结果
   * @throws {DomainValidationError} 当 status 非 running 时
   */
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
    this._events.push({
      eventType: 'RunCompleted',
      aggregateType: 'Run',
      aggregateId: this.id,
      payload: {
        name: this.name,
        portfolioId: this.portfolioId,
        ownerUserId: this.ownerUserId,
      },
      occurredAt: this._completedAt,
    });
  }

  /**
   * running → failed。设 failureReason + completedAt，产生 RunFailed 事件。
   *
   * @param reason - 失败原因
   * @throws {DomainValidationError} 当 status 非 running 时
   */
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
    this._events.push({
      eventType: 'RunFailed',
      aggregateType: 'Run',
      aggregateId: this.id,
      payload: {
        name: this.name,
        portfolioId: this.portfolioId,
        ownerUserId: this.ownerUserId,
        failureReason: reason,
      },
      occurredAt: this._completedAt,
    });
  }

  /**
   * queued|running → cancelled。设 completedAt，产生 RunCancelled 事件。
   *
   * @throws {DomainValidationError} 当 status 已是终态时
   */
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
    this._events.push({
      eventType: 'RunCancelled',
      aggregateType: 'Run',
      aggregateId: this.id,
      payload: {
        name: this.name,
        portfolioId: this.portfolioId,
        ownerUserId: this.ownerUserId,
      },
      occurredAt: this._completedAt,
    });
  }

  /**
   * 取出累积的领域事件并清空内部缓存。
   *
   * 调用者应在持久化聚合根后调用此方法，将事件交给 eventDispatcher 分发。
   *
   * @returns 待分发的事件数组（取后清空）
   */
  pullEvents(): DomainEvent[] {
    const events = [...this._events];
    this._events.length = 0;
    return events;
  }

  /** 内部：生成 eventId（导出供测试断言） */
  static newEventId(): string {
    return randomUUID();
  }
}
