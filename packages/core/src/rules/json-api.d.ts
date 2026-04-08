import type { JsonApiRule, Fetcher } from '../types.js';
/**
 * 执行 JSON API 规则：请求 API → 用 JSONPath 提取图片 URL
 * 支持简单的 JSONPath 语法：$.data[*].url 或 $.items[*].image
 */
export declare function executeJsonApiRule(rule: JsonApiRule, fetch: Fetcher): Promise<string[]>;
//# sourceMappingURL=json-api.d.ts.map