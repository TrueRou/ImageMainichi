import type { Rule, Fetcher } from '../types.js';
/**
 * 规则引擎入口 — 根据规则类型分发到对应处理器
 * @param rule   规则定义
 * @param fetch  平台无关的 fetch 函数（Worker 传 globalThis.fetch，Node 传 node-fetch）
 * @returns      图片 URL 列表
 */
export declare function executeRule(rule: Rule, fetch: Fetcher): Promise<string[]>;
//# sourceMappingURL=index.d.ts.map