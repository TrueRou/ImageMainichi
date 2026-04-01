import type { Manifest, Rule } from './types.js'

const VALID_RULE_TYPES = ['json-api', 'css-selector', 'rss'] as const
const VALID_MODES = ['scheduled', 'dynamic', 'both'] as const

export function parseManifest(raw: unknown): Manifest {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Manifest must be a JSON object')
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.name !== 'string' || !obj.name) {
    throw new Error('Manifest "name" is required and must be a string')
  }

  const images = Array.isArray(obj.images) ? obj.images : []
  const rules = Array.isArray(obj.rules) ? obj.rules : []

  // Validate images
  for (const img of images) {
    if (!img || typeof img !== 'object' || typeof img.url !== 'string') {
      throw new Error('Each image entry must have a "url" string')
    }
  }

  // Validate rules
  for (const rule of rules) {
    validateRule(rule)
  }

  return {
    name: obj.name,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    images,
    rules,
  }
}

function validateRule(rule: unknown): asserts rule is Rule {
  if (!rule || typeof rule !== 'object') {
    throw new Error('Each rule must be an object')
  }

  const r = rule as Record<string, unknown>

  if (!r.name || typeof r.name !== 'string') {
    throw new Error('Rule "name" is required')
  }
  if (!VALID_RULE_TYPES.includes(r.type as typeof VALID_RULE_TYPES[number])) {
    throw new Error(`Rule type must be one of: ${VALID_RULE_TYPES.join(', ')}`)
  }
  if (!VALID_MODES.includes(r.mode as typeof VALID_MODES[number])) {
    throw new Error(`Rule mode must be one of: ${VALID_MODES.join(', ')}`)
  }
  if (typeof r.url !== 'string') {
    throw new Error(`Rule "${r.name}" must have a "url" string`)
  }

  switch (r.type) {
    case 'json-api':
      if (typeof r.imagePath !== 'string') {
        throw new Error(`json-api rule "${r.name}" requires "imagePath"`)
      }
      break
    case 'css-selector':
      if (typeof r.selector !== 'string' || typeof r.attribute !== 'string') {
        throw new Error(`css-selector rule "${r.name}" requires "selector" and "attribute"`)
      }
      break
    case 'rss':
      if (!['enclosure', 'media:content', 'content-img'].includes(r.imageFrom as string)) {
        throw new Error(`rss rule "${r.name}" requires valid "imageFrom"`)
      }
      break
  }
}
