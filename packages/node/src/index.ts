import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, cpSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, extname, basename, dirname, isAbsolute, normalize, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executeRule, parseManifest, parseRule, type Manifest, type ImageEntry, type Rule } from '@image-mainichi/core'

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
}

export interface TestRuleResult {
  rule: Pick<Rule, 'name' | 'type' | 'mode'>
  fetchedUrls: string[]
  imageUrls: string[]
}

export interface InitTemplateOptions {
  targetDir: string
  baseDir?: string
  name?: string
}

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(PACKAGE_DIR, '../../..')
const TEMPLATE_DIR = resolve(REPO_ROOT, 'template')

export async function crawl(options: CrawlOptions): Promise<{ added: number; removed: number }> {
  const workDir = resolveWorkDir(options.workDir)
  const manifestPath = join(workDir, 'manifest.json')
  const imagesDir = join(workDir, 'images')
  const rules = listRules(workDir)
    .map((record) => record.rule)
    .filter((rule) => rule.mode === 'crawl')

  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true })
  }

  const manifest = readManifest(workDir)

  if (rules.length === 0) {
    console.log('No crawl rules found, skipping.')
    return { added: 0, removed: 0 }
  }

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

  const existingHashes = new Set(
    manifest.images.map((img) => hashUrl(img.url))
  )

  const newUrls = allUrls
    .filter((url) => !existingHashes.has(hashUrl(url)))
    .slice(0, options.maxImages)

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

  let removed = 0
  while (manifest.images.length > options.keepMax) {
    manifest.images.shift()
    removed++
  }

  writeManifest(manifestPath, manifest)

  console.log(`Done: +${added} images, -${removed} evicted`)
  return { added, removed }
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
  const workDir = resolveWorkDir(options.workDir, options.baseDir)
  const records = listRules(workDir)
  const record = findRule(records, options.selector)

  const fetchedUrls: string[] = []
  const tracedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url

    fetchedUrls.push(url)
    return fetch(input, init)
  }

  const imageUrls = await executeRule(record.rule, tracedFetch)

  return {
    rule: {
      name: record.rule.name,
      type: record.rule.type,
      mode: record.rule.mode,
    },
    fetchedUrls,
    imageUrls: typeof options.limit === 'number'
      ? imageUrls.slice(0, options.limit)
      : imageUrls,
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

  cpSync(TEMPLATE_DIR, targetDir, { recursive: true })

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
