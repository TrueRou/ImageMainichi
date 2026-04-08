#!/usr/bin/env node

import { downloadToManifest, formatRuleList, formatTestRuleResult, initTemplate, listRules, resolveWorkDir, testRule } from '@image-mainichi/node'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const [command, subcommand, ...rest] = args

  if (!command || command === '--help' || command === '-h') {
    printHelp()
    return
  }

  if (command === 'init') {
    runInit([subcommand, ...rest].filter(Boolean) as string[])
    return
  }

  if (command === 'rule' && subcommand === 'list') {
    runRuleList(rest)
    return
  }

  if (command === 'rule' && subcommand === 'test') {
    await runRuleTest(rest)
    return
  }

  throw new Error(`Unknown command: ${args.join(' ')}`)
}

function runInit(args: string[]): void {
  let dir = 'image-mainichi-source'
  let name: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--name':
        name = args[++i]
        if (!name) {
          throw new Error('--name requires a value')
        }
        break
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`)
        }
        dir = arg
        break
    }
  }

  const targetDir = initTemplate({ targetDir: dir, name })
  console.log(`Created source at ${targetDir}`)
  console.log('Next steps:')
  console.log(`- cd ${targetDir}`)
  console.log('- edit rules/*.json')
  console.log('- run imagemainichi rule list')
  console.log('- run imagemainichi rule test <selector>')
}

function runRuleList(args: string[]): void {
  const { workDir } = parseCommonArgs(args)
  const resolvedWorkDir = resolveWorkDir(workDir)
  const rules = listRules(resolvedWorkDir)
  console.log(formatRuleList(rules))
}

async function runRuleTest(args: string[]): Promise<void> {
  const { workDir, limit, json, list, dl, selector } = parseRuleTestArgs(args)
  const resolvedWorkDir = resolveWorkDir(workDir)
  const rules = listRules(resolvedWorkDir)

  if (list) {
    console.log(formatRuleList(rules))
    return
  }

  if (!selector) {
    throw new Error('Missing rule selector. Use imagemainichi rule test <selector> or --list')
  }

  const result = await testRule({
    selector,
    workDir: resolvedWorkDir,
    limit,
    onDebug: (message: string) => console.error(`[debug] ${message}`),
  })

  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(formatTestRuleResult(result))
  }

  if (dl) {
    console.log(`\nDownloading ${result.imageUrls.length} image(s) to ${resolvedWorkDir}/images/`)
    const dlResult = await downloadToManifest({
      workDir: resolvedWorkDir,
      imageUrls: result.imageUrls,
      downloadHeaders: result.downloadHeaders,
      onError: (i, total, url, e) => console.error(`  [${i + 1}/${total}] ${e instanceof Error ? e.message : String(e)} <- ${url}`),
    })
    console.log(`Done: +${dlResult.added} added, -${dlResult.removed} evicted`)
  }
}

function parseCommonArgs(args: string[]): { workDir: string } {
  let workDir = process.cwd()

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
      case '--work-dir':
        workDir = args[++i] ?? workDir
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { workDir }
}

function parseRuleTestArgs(args: string[]): {
  workDir: string
  limit?: number
  json: boolean
  list: boolean
  dl: boolean
  selector?: string
} {
  let workDir = process.cwd()
  let limit: number | undefined
  let json = false
  let list = false
  let dl = false
  let selector: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    switch (arg) {
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
      case '--list':
        list = true
        break
      case '--download':
        dl = true
        break
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`)
        }
        selector = arg
        break
    }
  }

  return { workDir, limit, json, list, dl, selector }
}

function printHelp(): void {
  console.log('imagemainichi init [dir] [--name <name>]')
  console.log('imagemainichi rule list [--work-dir <path>]')
  console.log('imagemainichi rule test <selector> [--work-dir <path>] [--limit <n>] [--json] [--list] [--download]')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
