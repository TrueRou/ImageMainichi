import * as core from '@actions/core'
import { crawl } from './crawl.js'

async function run(): Promise<void> {
  try {
    const workDir = process.env.GITHUB_WORKSPACE || process.cwd()

    core.info(`Working directory: ${workDir}`)

    const result = await crawl({ workDir })

    core.setOutput('added', result.added)

    if (result.added > 0) {
      core.info(`Successfully added ${result.added} new images`)
    } else {
      core.info('No new images added')
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()
