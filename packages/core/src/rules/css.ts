import { parse } from 'node-html-parser'
import type { CssSelectorRule, Fetcher, RuleResult } from '../types.js'

/**
 * 执行 CSS 选择器规则：请求 HTML → 用选择器提取指定属性
 */
export async function executeCssSelectorRule(rule: CssSelectorRule, fetch: Fetcher): Promise<RuleResult> {
  const res = await fetch(rule.url)

  if (!res.ok) {
    throw new Error(`css-selector rule "${rule.name}": HTTP ${res.status}`)
  }

  const html = await res.text()
  const root = parse(html)
  const elements = root.querySelectorAll(rule.selector)

  const urls: string[] = []
  for (const el of elements) {
    const value = el.getAttribute(rule.attribute)
    if (value) {
      urls.push(resolveUrl(value, rule.url))
    }
  }

  return { imageUrls: urls }
}

function resolveUrl(value: string, baseUrl: string): string {
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//')) {
    return value.startsWith('//') ? `https:${value}` : value
  }
  try {
    return new URL(value, baseUrl).href
  } catch {
    return value
  }
}
