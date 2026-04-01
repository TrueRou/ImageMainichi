import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname } from 'node:path'
import { parseManifest, executeRule, type Manifest, type ImageEntry } from '@image-mainichi/core'

export interface CrawlOptions {
  maxImages: number
  keepMax: number
  workDir: string
}

/**
 * 执行爬取：读取 manifest → 执行 scheduled 规则 → 下载图片 → 更新 manifest
 */
export async function crawl(options: CrawlOptions): Promise<{ added: number; removed: number }> {
  const manifestPath = join(options.workDir, 'manifest.json')
  const imagesDir = join(options.workDir, 'images')

  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true })
  }

  // 读取 manifest
  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const manifest = parseManifest(raw)

  // 收集所有 scheduled / both 规则
  const rules = manifest.rules.filter(
    (r) => r.mode === 'scheduled' || r.mode === 'both'
  )

  if (rules.length === 0) {
    console.log('No scheduled rules found, skipping.')
    return { added: 0, removed: 0 }
  }

  // 执行规则，收集图片 URL
  const allUrls: string[] = []
  for (const rule of rules) {
    try {
      console.log(`Executing rule: ${rule.name}`)
      const urls = await executeRule(rule, fetch)
      console.log(`  Found ${urls.length} images`)
      allUrls.push(...urls)
    } catch (e) {
      console.error(`  Rule "${rule.name}" failed:`, e)
    }
  }

  if (allUrls.length === 0) {
    console.log('No images found from any rule.')
    return { added: 0, removed: 0 }
  }

  // 去重：基于 URL hash
  const existingHashes = new Set(
    manifest.images.map((img) => hashUrl(img.url))
  )

  const newUrls = allUrls
    .filter((url) => !existingHashes.has(hashUrl(url)))
    .slice(0, options.maxImages)

  // 下载图片
  let added = 0
  for (const url of newUrls) {
    try {
      const entry = await downloadImage(url, imagesDir)
      if (entry) {
        manifest.images.push(entry)
        added++
      }
    } catch (e) {
      console.error(`  Failed to download ${url}:`, e)
    }
  }

  // FIFO 淘汰
  let removed = 0
  while (manifest.images.length > options.keepMax) {
    manifest.images.shift()
    removed++
  }

  // 写回 manifest
  writeManifest(manifestPath, manifest)

  console.log(`Done: +${added} images, -${removed} evicted`)
  return { added, removed }
}

async function downloadImage(url: string, imagesDir: string): Promise<ImageEntry | null> {
  const res = await fetch(url)
  if (!res.ok) return null

  const buffer = Buffer.from(await res.arrayBuffer())
  const hash = hashUrl(url)
  const ext = guessExtension(url, res.headers.get('content-type'))
  const filename = `${hash}${ext}`
  const filepath = join(imagesDir, filename)

  writeFileSync(filepath, buffer)

  return {
    url: `images/${filename}`,
    addedAt: new Date().toISOString(),
  }
}

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12)
}

function guessExtension(url: string, contentType: string | null): string {
  // 从 URL 推断
  const urlExt = extname(new URL(url).pathname).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'].includes(urlExt)) {
    return urlExt
  }
  // 从 Content-Type 推断
  if (contentType) {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/avif': '.avif',
      'image/svg+xml': '.svg',
    }
    for (const [mime, ext] of Object.entries(map)) {
      if (contentType.includes(mime)) return ext
    }
  }
  return '.jpg'
}

function writeManifest(path: string, manifest: Manifest): void {
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')
}
