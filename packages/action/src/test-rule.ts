import { resolve } from 'node:path'
import { executeRule, type Rule } from '@image-mainichi/core'
import { loadRules } from './crawl.js'

interface CliOptions {
  rule: string
  workDir: string
  limit?: number
  json: boolean
}

interface TestRuleResult {
  rule: Pick<Rule, 'name' | 'type' | 'mode'>
  fetchedUrls: string[]
  imageUrls: string[]
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const rules = loadRules(resolve(options.workDir, 'rules'))
  const rule = findRule(rules, options.rule)

  if (!rule) {
    throw new Error(`Rule not found: ${options.rule}`)
  }

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

  const imageUrls = await executeRule(rule, tracedFetch)
  const result: TestRuleResult = {
    rule: {
      name: rule.name,
      type: rule.type,
      mode: rule.mode,
    },
    fetchedUrls,
    imageUrls: typeof options.limit === 'number'
      ? imageUrls.slice(0, options.limit)
      : imageUrls,
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  printResult(result)
}

function parseArgs(args: string[]): CliOptions {
  let rule = ''
  let workDir = process.cwd()
  let limit: number | undefined
  let json = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--rule':
        rule = args[++i] ?? ''
        break
      case '--work-dir':
        workDir = args[++i] ?? workDir
        break
      case '--limit': {
        const value = args[++i]
        if (!value || Number.isNaN(Number(value))) {
          throw new Error('--limit requires a number')
        }
        limit = Number(value)
        break
      }
      case '--json':
        json = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!rule) {
    throw new Error('Missing required argument: --rule <name>')
  }

  return { rule, workDir, limit, json }
}

function findRule(rules: Rule[], target: string): Rule | undefined {
  const normalized = target.endsWith('.json') ? target.slice(0, -5) : target
  return rules.find((rule) => rule.name === target || rule.name === normalized)
}

function printResult(result: TestRuleResult): void {
  console.log(`Rule: ${result.rule.name}`)
  console.log(`Type: ${result.rule.type}`)
  console.log(`Mode: ${result.rule.mode}`)
  console.log('')

  console.log(`Fetched URLs (${result.fetchedUrls.length}):`)
  for (const url of result.fetchedUrls) {
    console.log(`- ${url}`)
  }

  console.log('')
  console.log(`Image URLs (${result.imageUrls.length}):`)
  for (const url of result.imageUrls) {
    console.log(`- ${url}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
