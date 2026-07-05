/**
 * CQRS 接口约定（T-30）
 *
 * 企业为何需要：读写路径分离的**接口契约**先行，为未来只读副本/投影留出扩展点，
 * 而不必一次性引入完整事件溯源。Command 改变状态；Query 只读无副作用。
 */

/** @public 命令：改变系统状态，可触发领域事件 */
export interface Command {
  readonly type: string;
}

/** @public 查询：只读，无副作用 */
export interface Query {
  readonly type: string;
}

/** @public 命令处理器 */
export interface CommandHandler<C extends Command, R = void> {
  execute(command: C): Promise<R>;
}

/** @public 查询处理器 */
export interface QueryHandler<Q extends Query, R> {
  execute(query: Q): Promise<R>;
}
