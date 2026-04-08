import type { RssRule, Fetcher } from '../types.js';
/**
 * 执行 RSS/Atom 规则：请求 feed → 根据策略提取图片 URL
 * 使用正则解析 XML，避免引入重量级 XML 解析器
 */
export declare function executeRssRule(rule: RssRule, fetch: Fetcher): Promise<string[]>;
//# sourceMappingURL=rss.d.ts.map