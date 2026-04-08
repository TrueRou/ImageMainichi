import { formatTestRuleResult, testRule } from '@image-mainichi/node'

interface CliOptions {
  rule: string
  workDir: string
  limit?: number
  json: boolean
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const result = await testRule({
    selector: options.rule,
    workDir: options.workDir,
    baseDir: process.env.INIT_CWD || process.cwd(),
    limit: options.limit,
    onDebug: (message: string) => console.error(`[debug] ${message}`),
  })

  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }

  console.log(formatTestRuleResult(result))
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
