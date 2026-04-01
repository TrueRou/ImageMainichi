import type { SourceConfig, Manifest, ImageEntry } from '@image-mainichi/core'
import { parseManifest } from '@image-mainichi/core'

const MANIFEST_CACHE_TTL = 300 // 5 minutes

/**
 * 从 GitHub raw URL 加载数据源的 manifest.json
 */
export async function loadManifest(source: SourceConfig): Promise<Manifest> {
  const url = getManifestUrl(source)

  // 尝试使用 Cache API
  const cache = (caches as unknown as { default: Cache }).default
  const cacheKey = new Request(url)
  const cached = await cache.match(cacheKey)

  if (cached) {
    const json = await cached.json()
    return parseManifest(json)
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load manifest from ${url}: HTTP ${res.status}`)
  }

  // 缓存响应
  const resClone = new Response(res.body, res)
  resClone.headers.set('Cache-Control', `s-maxage=${MANIFEST_CACHE_TTL}`)
  await cache.put(cacheKey, resClone)

  const json = await res.json()
  return parseManifest(json)
}

/**
 * 加载所有数据源，收集静态图片列表
 */
export async function loadAllSources(sources: SourceConfig[]): Promise<{
  manifests: { source: SourceConfig; manifest: Manifest }[]
  errors: { source: SourceConfig; error: string }[]
}> {
  const results = await Promise.allSettled(
    sources.map(async (source) => ({
      source,
      manifest: await loadManifest(source),
    }))
  )

  const manifests: { source: SourceConfig; manifest: Manifest }[] = []
  const errors: { source: SourceConfig; error: string }[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      manifests.push(result.value)
    } else {
      errors.push({ source: sources[i], error: String(result.reason) })
    }
  }

  return { manifests, errors }
}

/**
 * 将静态图片的相对路径解析为完整 URL
 */
export function resolveImageUrl(image: ImageEntry, source: SourceConfig): string {
  if (image.url.startsWith('http://') || image.url.startsWith('https://')) {
    return image.url
  }
  const base = getRawBaseUrl(source)
  return `${base}/${image.url}`
}

function getManifestUrl(source: SourceConfig): string {
  const base = getRawBaseUrl(source)
  return `${base}/manifest.json`
}

function getRawBaseUrl(source: SourceConfig): string {
  if (source.rawBaseUrl) {
    return source.rawBaseUrl.replace(/\/$/, '')
  }
  const [repo, branch = 'main'] = source.repo.split('@')
  return `https://raw.githubusercontent.com/${repo}/${branch}`
}
