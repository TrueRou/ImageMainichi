import * as core from '@actions/core'
import { crawl } from './crawl.js'

async function run(): Promise<void> {
  try {
    const maxImages = parseInt(core.getInput('max-images') || '10', 10)
    const keepMax = parseInt(core.getInput('keep-max') || '200', 10)
    const workDir = process.env.GITHUB_WORKSPACE || process.cwd()

    core.info(`Crawling with maxImages=${maxImages}, keepMax=${keepMax}`)
    core.info(`Working directory: ${workDir}`)

    const result = await crawl({ maxImages, keepMax, workDir })

    core.setOutput('added', result.added)
    core.setOutput('removed', result.removed)

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
