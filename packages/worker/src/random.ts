import type { SourceConfig, Manifest, Rule } from '@image-mainichi/core'
import { executeRule } from '@image-mainichi/core'
import { resolveImageUrl } from './source-loader.js'

export interface ResolvedImage {
  url: string
  tags?: string[]
  sourceName: string
}

/**
 * 从所有数据源中收集候选图片，然后随机选取一张
 */
export async function pickRandomImage(
  sources: { source: SourceConfig; manifest: Manifest; rules: Rule[] }[],
  options: { tag?: string; enableOnDemand?: boolean; kvCache?: KVNamespace } = {}
): Promise<ResolvedImage | null> {
  const pool: ResolvedImage[] = []

  for (const { source, manifest, rules } of sources) {
    // 收集静态图片
    for (const img of manifest.images) {
      pool.push({
        url: resolveImageUrl(img, source),
        tags: img.tags,
        sourceName: manifest.name,
      })
    }

    if (options.enableOnDemand) {
      const onDemandRules = rules.filter((rule) => rule.mode === 'on-demand')

      for (const rule of onDemandRules) {
        try {
          const urls = await executeOnDemandRule(rule, manifest.name, options.kvCache)
          for (const url of urls) {
            pool.push({ url, sourceName: manifest.name })
          }
        } catch (e) {
          console.error(`on-demand rule "${rule.name}" failed:`, e)
        }
      }
    }
  }

  // 按标签过滤
  const filtered = options.tag
    ? pool.filter((img) => img.tags?.includes(options.tag!))
    : pool

  if (filtered.length === 0) return null

  const index = Math.floor(Math.random() * filtered.length)
  return filtered[index]
}

const KV_CACHE_TTL = 600 // 10 minutes

async function executeOnDemandRule(
  rule: Rule,
  sourceName: string,
  kvCache?: KVNamespace
): Promise<string[]> {
  const cacheKey = `rule:${sourceName}:${rule.name}`

  if (kvCache) {
    const cached = await kvCache.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }
  }

  const result = await executeRule(rule, fetch)

  if (kvCache && result.imageUrls.length > 0) {
    await kvCache.put(cacheKey, JSON.stringify(result.imageUrls), { expirationTtl: KV_CACHE_TTL })
  }

  return result.imageUrls
}
