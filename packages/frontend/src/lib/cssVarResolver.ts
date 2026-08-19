// canvas 渲染器无法解析 CSS 变量，渲染前把 var(--x)/hsl(var(--x)) 深度解析为具体色值；
// 正则须连同外层 hsl(...) 一起消费，否则产生非法 hsl(hsl(...))（d029c766 回归）
const VAR_PATTERN = /(hsl\()?var\((--[\w-]+)\)(\))?/g;
export function resolveVarColorToken(input: string, resolve: (name: string) => string): string {
  return input.replace(
    VAR_PATTERN,
    (full, _hslOpen: string | undefined, name: string) => resolve(name) || full,
  );
}
