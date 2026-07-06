/**
 * pg-copy-streams 类型声明
 *
 * pg-copy-streams 未自带 TypeScript 类型声明。
 * from() 返回 pg Submittable 兼容的可写流，用于 COPY FROM STDIN。
 */
declare module 'pg-copy-streams' {
  /**
   * 创建 COPY FROM STDIN 可写流。
   *
   * @param text - COPY SQL 语句
   * @returns 可写流，兼容 pg Submittable，包含 rowCount 属性
   */
  export function from(text: string): NodeJS.WritableStream & {
    /** 导入的行数（流完成后可用） */
    rowCount?: number;
  };
}
