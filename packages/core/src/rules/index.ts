import type { Rule, Fetcher, RuleResult, ExecuteRuleOptions } from '../types.js'
import { executeJsonApiRule } from './json-api.js'
import { executeCssSelectorRule } from './css.js'
import { executeRssRule } from './rss.js'
import { executeManhuaguiRule } from './manhuagui.js'

/**
 * 规则引擎入口 — 根据规则类型分发到对应处理器
 * @param rule    规则定义
 * @param fetch   平台无关的 fetch 函数
 * @param options 可选参数（如增量爬取游标）
 * @returns       规则执行结果
 */
export async function executeRule(rule: Rule, fetch: Fetcher, options?: ExecuteRuleOptions): Promise<RuleResult> {
  switch (rule.type) {
    case 'json-api':
      return executeJsonApiRule(rule, fetch)
    case 'css-selector':
      return executeCssSelectorRule(rule, fetch)
    case 'rss':
      return executeRssRule(rule, fetch)
    case 'manhuagui':
      return executeManhuaguiRule(rule, fetch, options)
    default:
      throw new Error(`Unknown rule type: ${(rule as Rule).type}`)
  }
}
