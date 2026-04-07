import type { SourceConfig, Manifest, ImageEntry, Rule } from '@image-mainichi/core'
import { parseManifest, parseRule } from '@image-mainichi/core'

const MANIFEST_CACHE_TTL = 300 // 5 minutes

export interface LoadedSource {
  source: SourceConfig
  manifest: Manifest
  rules: Rule[]
}

/**
 * 从 GitHub raw URL 加载数据源的 manifest.json 和 rules/*.json
 */
export async function loadSource(source: SourceConfig): Promise<LoadedSource> {
  const manifest = await loadManifest(source)
  const rules = await loadRules(source)
  return { source, manifest, rules }
}

async function loadManifest(source: SourceConfig): Promise<Manifest> {
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

async function loadRules(source: SourceConfig): Promise<Rule[]> {
  if (source.rawBaseUrl) {
    return []
  }

  const { repo, branch } = parseRepo(source.repo)
  const url = `https://api.github.com/repos/${repo}/contents/rules?ref=${branch}`
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ImageMainichi',
    },
  })

  if (res.status === 404) {
    return []
  }
  if (!res.ok) {
    throw new Error(`Failed to load rules from ${url}: HTTP ${res.status}`)
  }

  const entries = await res.json() as Array<{ type?: string; download_url?: string; name?: string }>
  const rules: Rule[] = []

  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name?.endsWith('.json') || !entry.download_url) {
      continue
    }

    const ruleRes = await fetch(entry.download_url)
    if (!ruleRes.ok) {
      throw new Error(`Failed to load rule file ${entry.download_url}: HTTP ${ruleRes.status}`)
    }

    rules.push(parseRule(await ruleRes.json()))
  }

  return rules
}

/**
 * 加载所有数据源，收集静态图片列表
 */
export async function loadAllSources(sources: SourceConfig[]): Promise<{
  sources: LoadedSource[]
  errors: { source: SourceConfig; error: string }[]
}> {
  const results = await Promise.allSettled(sources.map((source) => loadSource(source)))

  const loadedSources: LoadedSource[] = []
  const errors: { source: SourceConfig; error: string }[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      loadedSources.push(result.value)
    } else {
      errors.push({ source: sources[i], error: String(result.reason) })
    }
  }

  return { sources: loadedSources, errors }
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
  const { repo, branch } = parseRepo(source.repo)
  return `https://raw.githubusercontent.com/${repo}/${branch}`
}

function parseRepo(raw: string): { repo: string; branch: string } {
  const [repo, branch = 'main'] = raw.split('@')
  return { repo, branch }
}
