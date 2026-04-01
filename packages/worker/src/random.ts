import type { SourceConfig, Manifest, ImageEntry } from '@image-mainichi/core'
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
  manifests: { source: SourceConfig; manifest: Manifest }[],
  options: { tag?: string; enableDynamic?: boolean; kvCache?: KVNamespace } = {}
): Promise<ResolvedImage | null> {
  const pool: ResolvedImage[] = []

  for (const { source, manifest } of manifests) {
    // 1. 收集静态图片
    for (const img of manifest.images) {
      pool.push({
        url: resolveImageUrl(img, source),
        tags: img.tags,
        sourceName: manifest.name,
      })
    }

    // 2. 如果启用动态模式，执行 dynamic/both 规则
    if (options.enableDynamic) {
      const dynamicRules = manifest.rules.filter(
        (r) => r.mode === 'dynamic' || r.mode === 'both'
      )

      for (const rule of dynamicRules) {
        try {
          const urls = await executeDynamicRule(rule, manifest.name, options.kvCache)
          for (const url of urls) {
            pool.push({ url, sourceName: manifest.name })
          }
        } catch (e) {
          console.error(`Dynamic rule "${rule.name}" failed:`, e)
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

async function executeDynamicRule(
  rule: Parameters<typeof executeRule>[0],
  sourceName: string,
  kvCache?: KVNamespace
): Promise<string[]> {
  const cacheKey = `rule:${sourceName}:${rule.name}`

  // 尝试从 KV 读取缓存
  if (kvCache) {
    const cached = await kvCache.get(cacheKey)
    if (cached) {
      return JSON.parse(cached)
    }
  }

  const urls = await executeRule(rule, fetch)

  // 写入 KV 缓存
  if (kvCache && urls.length > 0) {
    await kvCache.put(cacheKey, JSON.stringify(urls), { expirationTtl: KV_CACHE_TTL })
  }

  return urls
}
