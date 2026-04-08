import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, cpSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname, basename, dirname, isAbsolute, normalize, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executeRule, parseManifest, parseRule, type Manifest, type ImageEntry, type Rule, type RuleResult } from '@image-mainichi/core'

export interface CrawlOptions {
  maxImages: number
  keepMax: number
  workDir: string
}

export interface RuleRecord {
  filePath: string
  relativePath: string
  fileName: string
  fileBaseName: string
  rule: Rule
}

export interface TestRuleOptions {
  selector: string
  workDir?: string
  baseDir?: string
  limit?: number
  onDebug?: (message: string) => void
}

export interface TestRuleResult {
  rule: Pick<Rule, 'name' | 'type' | 'mode'>
  fetchedUrls: string[]
  imageUrls: string[]
  downloadHeaders?: Record<string, string>
}

export interface InitTemplateOptions {
  targetDir: string
  baseDir?: string
  name?: string
}

function getTemplateDir(): string {
  const packageDir = dirname(fileURLToPath(import.meta.url))
  return resolve(packageDir, '..', 'template')
}

export interface DownloadOptions {
  workDir: string
  imageUrls: string[]
  downloadHeaders?: Record<string, string>
  maxImages?: number
  keepMax?: number
  onProgress?: (index: number, total: number, filename: string, size: number) => void
  onError?: (index: number, total: number, url: string, error: unknown) => void
}

export interface DownloadResult {
  added: number
  removed: number
}

/**
 * 下载图片并更新 manifest — crawl 和 CLI --download 的共享实现。
 * 去重（基于 URL hash）、下载到 images/、写 manifest、FIFO 淘汰。
 */
export async function downloadToManifest(options: DownloadOptions): Promise<DownloadResult> {
  const workDir = resolveWorkDir(options.workDir)
  const manifestPath = join(workDir, 'manifest.json')
  const imagesDir = join(workDir, 'images')
  const maxImages = options.maxImages ?? options.imageUrls.length
  const keepMax = options.keepMax ?? Infinity

  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true })
  }

  const manifest = readManifest(workDir)

  const existingHashes = new Set(
    manifest.images.map((img) => hashUrl(img.url))
  )

  const newUrls = options.imageUrls
    .filter((url) => !existingHashes.has(hashUrl(url)))
    .slice(0, maxImages)

  if (newUrls.length === 0) {
    return { added: 0, removed: 0 }
  }

  let added = 0
  for (let i = 0; i < newUrls.length; i++) {
    const url = newUrls[i]
    try {
      const entry = await downloadImage(url, imagesDir, options.downloadHeaders)
      if (entry) {
        manifest.images.push(entry)
        added++
        options.onProgress?.(i, newUrls.length, entry.url, 0)
      }
    } catch (e) {
      options.onError?.(i, newUrls.length, url, e)
    }
  }

  let removed = 0
  while (manifest.images.length > keepMax) {
    manifest.images.shift()
    removed++
  }

  writeManifest(manifestPath, manifest)

  return { added, removed }
}

export async function crawl(options: CrawlOptions): Promise<DownloadResult> {
  const workDir = resolveWorkDir(options.workDir)
  const manifestPath = join(workDir, 'manifest.json')
  const rules = listRules(workDir)
    .map((record) => record.rule)
    .filter((rule) => rule.mode === 'crawl')

  if (rules.length === 0) {
    console.log('No crawl rules found, skipping.')
    return { added: 0, removed: 0 }
  }

  const manifest = readManifest(workDir)
  const cursors = { ...manifest.cursors }

  const allUrls: string[] = []
  let downloadHeaders: Record<string, string> | undefined
  for (const rule of rules) {
    try {
      console.log(`Executing rule: ${rule.name}`)
      const cursor = cursors[rule.name]
      const result = await executeRule(rule, fetch, { cursor })
      console.log(`  Found ${result.imageUrls.length} images`)
      allUrls.push(...result.imageUrls)
      if (result.downloadHeaders) {
        downloadHeaders = result.downloadHeaders
      }
      if (result.cursor) {
        cursors[rule.name] = result.cursor
      }
    } catch (e) {
      console.error(`  Rule "${rule.name}" failed:`, e)
    }
  }

  // 更新 cursors 到 manifest（即使没有新图片也要保存游标）
  manifest.cursors = Object.keys(cursors).length > 0 ? cursors : undefined
  writeManifest(manifestPath, manifest)

  if (allUrls.length === 0) {
    console.log('No new images found from any rule.')
    return { added: 0, removed: 0 }
  }

  const result = await downloadToManifest({
    workDir,
    imageUrls: allUrls,
    downloadHeaders,
    maxImages: options.maxImages,
    keepMax: options.keepMax,
    onError: (_i, _total, url, e) => console.error(`  Failed to download ${url}:`, e),
  })

  console.log(`Done: +${result.added} images, -${result.removed} evicted`)
  return result
}

export function resolveWorkDir(workDir = process.cwd(), baseDir = process.env.INIT_CWD || process.cwd()): string {
  return isAbsolute(workDir) ? normalize(workDir) : resolve(baseDir, workDir)
}

export function readManifest(workDir: string): Manifest {
  const manifestPath = join(workDir, 'manifest.json')
  const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  return parseManifest(raw)
}

export function listRules(workDir: string): RuleRecord[] {
  const resolvedWorkDir = resolveWorkDir(workDir)
  const rulesDir = join(resolvedWorkDir, 'rules')

  if (!existsSync(rulesDir)) {
    return []
  }

  return readdirSync(rulesDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const filePath = join(rulesDir, name)
      const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
      return {
        filePath,
        relativePath: relative(resolvedWorkDir, filePath) || name,
        fileName: name,
        fileBaseName: basename(name, '.json'),
        rule: parseRule(raw),
      }
    })
}

export function loadRules(rulesDir: string): Rule[] {
  const workDir = basename(rulesDir) === 'rules'
    ? dirname(rulesDir)
    : rulesDir
  return listRules(workDir).map((record) => record.rule)
}

export function findRule(records: RuleRecord[], selector: string): RuleRecord {
  const normalizedSelector = normalizeSelector(selector)
  const matches = records.filter((record) => matchesSelector(record, normalizedSelector))

  if (matches.length === 1) {
    return matches[0]
  }

  if (matches.length > 1) {
    throw new Error([
      `Rule selector is ambiguous: ${selector}`,
      'Matched rules:',
      ...formatRuleChoices(matches),
    ].join('\n'))
  }

  throw new Error([
    `Rule not found: ${selector}`,
    records.length > 0 ? 'Available rules:' : 'No rules found under rules/*.json',
    ...formatRuleChoices(records),
  ].join('\n'))
}

export async function testRule(options: TestRuleOptions): Promise<TestRuleResult> {
  const debug = options.onDebug ?? (() => {})
  const workDir = resolveWorkDir(options.workDir, options.baseDir)
  debug(`Resolved work directory: ${workDir}`)

  const records = listRules(workDir)
  debug(`Discovered ${records.length} rule file(s) under ${join(workDir, 'rules')}`)
  for (const record of records) {
    debug(`- ${record.fileBaseName} -> ${record.rule.name} [${record.rule.type} | ${record.rule.mode}] (${record.relativePath})`)
  }

  debug(`Selecting rule with selector: ${options.selector}`)
  const record = findRule(records, options.selector)
  debug(`Matched rule: ${record.rule.name} from ${record.relativePath}`)
  debug(`Rule URL: ${record.rule.url}`)
  debug(`Rule mode/type: ${record.rule.mode} / ${record.rule.type}`)

  const fetchedUrls: string[] = []
  const tracedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

    fetchedUrls.push(url)
    debug(`Fetching: ${url}`)
    if (init?.method) {
      debug(`Fetch method: ${init.method}`)
    }
    if (init?.headers) {
      debug(`Fetch headers present`)
    }

    try {
      const response = await fetch(input, init)
      debug(`Fetch response: ${response.status} ${response.statusText} <- ${url}`)
      return response
    } catch (error) {
      if (error instanceof Error) {
        debug(`Fetch error: ${error.message} <- ${url}`)
        if ('cause' in error && error.cause) {
          debug(`Fetch cause: ${String(error.cause)} <- ${url}`)
        }
        if ('stack' in error && error.stack) {
          const stackLine = String(error.stack).split('\n')[1]
          if (stackLine) {
            debug(`Fetch stack: ${stackLine.trim()}`)
          }
        }
      } else {
        debug(`Fetch error: ${String(error)} <- ${url}`)
      }
      throw error
    }
  }

  debug('Executing rule')
  const result = await executeRule(record.rule, tracedFetch)
  debug(`Rule returned ${result.imageUrls.length} image URL(s)`)

  return {
    rule: {
      name: record.rule.name,
      type: record.rule.type,
      mode: record.rule.mode,
    },
    fetchedUrls,
    imageUrls: typeof options.limit === 'number'
      ? result.imageUrls.slice(0, options.limit)
      : result.imageUrls,
    downloadHeaders: result.downloadHeaders,
  }
}

export function formatTestRuleResult(result: TestRuleResult): string {
  const lines = [
    `Rule: ${result.rule.name}`,
    `Type: ${result.rule.type}`,
    `Mode: ${result.rule.mode}`,
    '',
    `Fetched URLs (${result.fetchedUrls.length}):`,
    ...result.fetchedUrls.map((url) => `- ${url}`),
    '',
    `Image URLs (${result.imageUrls.length}):`,
    ...result.imageUrls.map((url) => `- ${url}`),
  ]

  return lines.join('\n')
}

export function formatRuleList(records: RuleRecord[]): string {
  if (records.length === 0) {
    return 'No rules found under rules/*.json'
  }

  return records
    .map((record) => `${record.fileBaseName} -> ${record.rule.name} [${record.rule.type} | ${record.rule.mode}] (${record.relativePath})`)
    .join('\n')
}

export function initTemplate(options: InitTemplateOptions): string {
  const baseDir = options.baseDir ?? process.cwd()
  const targetDir = resolveWorkDir(options.targetDir, baseDir)

  cpSync(getTemplateDir(), targetDir, { recursive: true })

  if (options.name) {
    const manifestPath = join(targetDir, 'manifest.json')
    const manifest = readManifest(targetDir)
    writeManifest(manifestPath, {
      ...manifest,
      name: options.name,
    })
  }

  return targetDir
}

async function downloadImage(url: string, imagesDir: string, headers?: Record<string, string>): Promise<ImageEntry | null> {
  const res = await fetch(url, headers ? { headers } : undefined)
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
  const urlExt = extname(new URL(url).pathname).toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'].includes(urlExt)) {
    return urlExt
  }

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

function normalizeSelector(selector: string): string {
  const normalized = selector.replace(/\\/g, '/')
  return normalized.endsWith('.json') ? normalized.slice(0, -5) : normalized
}

function matchesSelector(record: RuleRecord, selector: string): boolean {
  const relativePath = record.relativePath.replace(/\\/g, '/')
  const filePath = record.filePath.replace(/\\/g, '/')

  return record.fileBaseName === selector
    || record.rule.name === selector
    || relativePath === selector
    || relativePath === `${selector}.json`
    || filePath === selector
    || filePath.endsWith(`/${selector}`)
    || filePath.endsWith(`/${selector}.json`)
}

function formatRuleChoices(records: RuleRecord[]): string[] {
  return records.map((record) => `- ${record.fileBaseName} -> ${record.rule.name} [${record.rule.type} | ${record.rule.mode}] (${record.relativePath})`)
}
