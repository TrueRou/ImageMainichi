import type { CssSelectorRule, Fetcher } from '../types.js';
/**
 * 执行 CSS 选择器规则：请求 HTML → 用选择器提取指定属性
 */
export declare function executeCssSelectorRule(rule: CssSelectorRule, fetch: Fetcher): Promise<string[]>;
//# sourceMappingURL=css.d.ts.map