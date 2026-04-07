import type { SourceConfig } from '@image-mainichi/core'
import { loadAllSources } from './source-loader.js'
import { pickRandomImage } from './random.js'

interface Env {
  SOURCES: string
  CACHE?: KVNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // 路由
    switch (url.pathname) {
      case '/':
        return handleRandom(url, env, 'redirect')
      case '/json':
        return handleRandom(url, env, 'json')
      case '/health':
        return new Response('ok')
      default:
        return new Response('Not Found', { status: 404 })
    }
  },
} satisfies ExportedHandler<Env>

async function handleRandom(
  url: URL,
  env: Env,
  mode: 'redirect' | 'json'
): Promise<Response> {
  const sources = parseSources(env.SOURCES)
  if (sources.length === 0) {
    return jsonResponse({ error: 'No sources configured' }, 500)
  }

  const { sources: loadedSources, errors } = await loadAllSources(sources)

  if (loadedSources.length === 0) {
    return jsonResponse({ error: 'All sources failed', details: errors }, 502)
  }

  const tag = url.searchParams.get('tag') ?? undefined
  const image = await pickRandomImage(loadedSources, {
    tag,
    enableOnDemand: true,
    kvCache: env.CACHE,
  })

  if (!image) {
    return jsonResponse({ error: 'No images available' }, 404)
  }

  if (mode === 'json') {
    return jsonResponse({
      url: image.url,
      tags: image.tags,
      source: image.sourceName,
    })
  }

  // 302 重定向到图片
  return Response.redirect(image.url, 302)
}

function parseSources(raw: string): SourceConfig[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
