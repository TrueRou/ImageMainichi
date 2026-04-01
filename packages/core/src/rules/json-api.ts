import type { JsonApiRule, Fetcher } from '../types.js'

/**
 * 执行 JSON API 规则：请求 API → 用 JSONPath 提取图片 URL
 * 支持简单的 JSONPath 语法：$.data[*].url 或 $.items[*].image
 */
export async function executeJsonApiRule(rule: JsonApiRule, fetch: Fetcher): Promise<string[]> {
  const res = await fetch(rule.url, {
    headers: rule.headers ?? {},
  })

  if (!res.ok) {
    throw new Error(`json-api rule "${rule.name}": HTTP ${res.status}`)
  }

  const json = await res.json()
  return extractByPath(json, rule.imagePath)
}

/**
 * 简易 JSONPath 实现，支持：
 *   $.key1.key2          → 嵌套取值
 *   $.key1[*].key2       → 遍历数组中每个元素的 key2
 *   $.key1[0].key2       → 取数组指定索引
 */
function extractByPath(data: unknown, path: string): string[] {
  const segments = parsePath(path)
  const results: string[] = []
  resolve(data, segments, 0, results)
  return results.filter((v) => typeof v === 'string' && v.length > 0)
}

interface Segment {
  key: string
  index?: number | '*'
}

function parsePath(path: string): Segment[] {
  // 去掉开头的 "$."
  const normalized = path.startsWith('$.') ? path.slice(2) : path
  const segments: Segment[] = []

  for (const part of normalized.split('.')) {
    const bracketMatch = part.match(/^(\w+)\[(\*|\d+)\]$/)
    if (bracketMatch) {
      segments.push({
        key: bracketMatch[1],
        index: bracketMatch[2] === '*' ? '*' : parseInt(bracketMatch[2], 10),
      })
    } else {
      segments.push({ key: part })
    }
  }

  return segments
}

function resolve(data: unknown, segments: Segment[], depth: number, results: string[]): void {
  if (depth >= segments.length) {
    if (typeof data === 'string') results.push(data)
    return
  }

  if (!data || typeof data !== 'object') return

  const seg = segments[depth]
  const value = (data as Record<string, unknown>)[seg.key]

  if (seg.index === undefined) {
    resolve(value, segments, depth + 1, results)
  } else if (seg.index === '*') {
    if (Array.isArray(value)) {
      for (const item of value) {
        resolve(item, segments, depth + 1, results)
      }
    }
  } else {
    if (Array.isArray(value) && seg.index < value.length) {
      resolve(value[seg.index], segments, depth + 1, results)
    }
  }
}
