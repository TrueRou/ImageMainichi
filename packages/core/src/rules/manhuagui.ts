import { parse } from 'node-html-parser'
import type { Fetcher, ManhuaguiRule, RuleResult } from '../types.js'

const IMAGE_HOST = 'https://i.hamreus.com'
const DOWNLOAD_HEADERS: Record<string, string> = {
  Referer: 'https://www.manhuagui.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
}

export async function executeManhuaguiRule(rule: ManhuaguiRule, fetch: Fetcher): Promise<RuleResult> {
  const comicUrl = normalizeComicUrl(rule.url)
  const chapterUrls = await loadChapterUrls(comicUrl, fetch)

  const targets = rule.scope === 'latest-chapter'
    ? chapterUrls.slice(0, 1)
    : chapterUrls

  const allImages = await Promise.all(targets.map((url) => loadChapterImages(url, fetch)))
  return {
    imageUrls: Array.from(new Set(allImages.flat())),
    downloadHeaders: DOWNLOAD_HEADERS,
  }
}

async function loadChapterUrls(comicUrl: string, fetch: Fetcher): Promise<string[]> {
  const res = await fetch(comicUrl, { headers: buildHeaders(comicUrl) })
  if (!res.ok) {
    throw new Error(`manhuagui rule: failed to load comic page ${comicUrl}: HTTP ${res.status}`)
  }

  const html = await res.text()
  const root = parse(html)

  // 漫画页可能将章节列表压缩在 #__VIEWSTATE hidden input 中
  let chapterRoot = root
  const hiddenInput = root.querySelector('#__VIEWSTATE')
  if (hiddenInput) {
    const compressed = hiddenInput.getAttribute('value')
    if (compressed) {
      const decompressed = decompressFromBase64(compressed)
      if (decompressed) {
        chapterRoot = parse(decompressed)
      }
    }
  }

  const links = chapterRoot.querySelectorAll('.chapter-list a[href*="/comic/"]')

  // 如果压缩数据中没找到，回退到原始页面的选择器
  if (links.length === 0) {
    const fallbackLinks = root.querySelectorAll('#chapter-list-0 a, .chapter a[href*="/comic/"]')
    const chapterUrls = fallbackLinks
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => Boolean(href))
      .map((href) => new URL(href, comicUrl).href)

    if (chapterUrls.length === 0) {
      throw new Error('manhuagui rule: no chapters found')
    }
    return chapterUrls
  }

  const chapterUrls = links
    .map((link) => link.getAttribute('href'))
    .filter((href): href is string => Boolean(href))
    .map((href) => new URL(href, comicUrl).href)

  if (chapterUrls.length === 0) {
    throw new Error('manhuagui rule: no chapters found')
  }

  return chapterUrls
}

async function loadChapterImages(chapterUrl: string, fetch: Fetcher): Promise<string[]> {
  const res = await fetch(chapterUrl, { headers: buildHeaders(chapterUrl) })
  if (!res.ok) {
    throw new Error(`manhuagui rule: failed to load chapter page ${chapterUrl}: HTTP ${res.status}`)
  }

  const html = await res.text()
  const data = decrypt(html)

  const path = typeof data.path === 'string' ? data.path : ''
  const files = Array.isArray(data.files) ? data.files.filter((value): value is string => typeof value === 'string') : []

  if (files.length === 0) {
    throw new Error(`manhuagui rule: no image files found in ${chapterUrl}`)
  }

  return files.map((file) => `${IMAGE_HOST}${path}${file}`)
}

function normalizeComicUrl(url: string): string {
  const parsed = new URL(url)
  parsed.protocol = 'https:'
  // 移动端域名重写为 www，确保获取到桌面版 HTML（包含 packed script）
  if (parsed.hostname === 'm.manhuagui.com') {
    parsed.hostname = 'www.manhuagui.com'
  }
  return parsed.href
}

function buildHeaders(targetUrl: string): Record<string, string> {
  const origin = new URL(targetUrl).origin
  return {
    Referer: `${origin}/`,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  }
}

// ============================================================
// 解密逻辑 — 参考 manhuagui-downloader 的 decrypt.rs
// ============================================================

interface DecryptResult {
  path?: string
  files?: unknown[]
  sl?: Record<string, string>
}

/**
 * 从章节页 HTML 中提取并解密图片数据。
 * 流程：extractDecryptionData → createDict → createJs → JSON.parse
 */
function decrypt(html: string): DecryptResult {
  const { payload, a, c, data } = extractDecryptionData(html)
  const dict = createDict(a, c, data)
  const js = createJs(payload, dict)
  return extractJsonFromJs(js)
}

/**
 * 提取 packed 脚本中的四个关键部分：
 * function body, base(a), count(c), LZ 压缩的字典
 */
function extractDecryptionData(html: string): { payload: string; a: number; c: number; data: string[] } {
  // 匹配 }('payload', a, c, 'compressed_dict'... 模式
  const match = html.match(/\}\('([^']*)',(\d+),(\d+),'([A-Za-z0-9+/=]*)'\[/)
  if (!match) {
    throw new Error('manhuagui rule: packed chapter payload not found')
  }

  const [, payload, aStr, cStr, compressedData] = match

  const decompressed = decompressFromBase64(compressedData)
  if (decompressed == null) {
    throw new Error('manhuagui rule: failed to decompress chapter dictionary')
  }

  const data = decompressed.split('|')

  return {
    payload,
    a: Number(aStr),
    c: Number(cStr),
    data,
  }
}

/**
 * 构建字典映射：编码后的 key → 字典中的值。
 * 对应 downloader 的 create_dict。
 */
function createDict(a: number, c: number, data: string[]): Map<string, string> {
  const dict = new Map<string, string>()

  for (let i = c - 1; i >= 0; i--) {
    const key = encodeKey(i, a)
    const value = data[i] || key
    dict.set(key, value)
  }

  return dict
}

/**
 * 将编码后的 payload 中的 word token 替换为字典值。
 * 对应 downloader 的 create_js：按 \b\w+\b 分割，逐 token 替换。
 */
function createJs(payload: string, dict: Map<string, string>): string {
  return payload.replace(/\b\w+\b/g, (token) => dict.get(token) ?? token)
}

/**
 * 从解密后的 JS 中提取 JSON 对象。
 * 解密后的结果形如 SMH.imgData(...){...})，提取最外层 {...}。
 */
function extractJsonFromJs(js: string): DecryptResult {
  const match = js.match(/\((\{.*\})\)/)
  if (!match) {
    throw new Error('manhuagui rule: decoded chapter object not found')
  }
  return JSON.parse(match[1])
}

/**
 * 将数字编码为指定进制的字符串。
 * 对应 downloader 的 e(c, a) 函数。
 */
function encodeKey(value: number, base: number): string {
  const prefix = value < base ? '' : encodeKey(Math.floor(value / base), base)
  const remainder = value % base
  const suffix = remainder > 35
    ? String.fromCharCode(remainder + 29)
    : '0123456789abcdefghijklmnopqrstuvwxyz'[remainder]
  return prefix + suffix
}

const keyStrBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='

function decompressFromBase64(input: string): string | null {
  if (input == null) return ''
  if (input === '') return null
  return _decompress(input.length, 32, (index) => getBaseValue(keyStrBase64, input.charAt(index)))
}

function getBaseValue(alphabet: string, character: string): number {
  const index = alphabet.indexOf(character)
  if (index === -1) {
    throw new Error(`manhuagui rule: invalid base64 character "${character}"`)
  }
  return index
}

function _decompress(length: number, resetValue: number, getNextValue: (index: number) => number): string | null {
  const dictionary: string[] = []
  let next
  let enlargeIn = 4
  let dictSize = 4
  let numBits = 3
  let entry = ''
  const result: string[] = []
  let i
  let w
  let bits
  let resb
  let maxpower
  let power
  let c
  const data = {
    val: getNextValue(0),
    position: resetValue,
    index: 1,
  }

  for (i = 0; i < 3; i++) {
    dictionary[i] = String(i)
  }

  bits = 0
  maxpower = 2 ** 2
  power = 1
  while (power !== maxpower) {
    resb = data.val & data.position
    data.position >>= 1
    if (data.position === 0) {
      data.position = resetValue
      data.val = getNextValue(data.index++)
    }
    bits |= (resb > 0 ? 1 : 0) * power
    power <<= 1
  }

  switch (next = bits) {
    case 0:
      bits = 0
      maxpower = 2 ** 8
      power = 1
      while (power !== maxpower) {
        resb = data.val & data.position
        data.position >>= 1
        if (data.position === 0) {
          data.position = resetValue
          data.val = getNextValue(data.index++)
        }
        bits |= (resb > 0 ? 1 : 0) * power
        power <<= 1
      }
      c = String.fromCharCode(bits)
      break
    case 1:
      bits = 0
      maxpower = 2 ** 16
      power = 1
      while (power !== maxpower) {
        resb = data.val & data.position
        data.position >>= 1
        if (data.position === 0) {
          data.position = resetValue
          data.val = getNextValue(data.index++)
        }
        bits |= (resb > 0 ? 1 : 0) * power
        power <<= 1
      }
      c = String.fromCharCode(bits)
      break
    case 2:
      return ''
    default:
      c = ''
  }

  dictionary[3] = c
  w = c
  result.push(c)

  while (true) {
    if (data.index > length) {
      return ''
    }

    bits = 0
    maxpower = 2 ** numBits
    power = 1
    while (power !== maxpower) {
      resb = data.val & data.position
      data.position >>= 1
      if (data.position === 0) {
        data.position = resetValue
        data.val = getNextValue(data.index++)
      }
      bits |= (resb > 0 ? 1 : 0) * power
      power <<= 1
    }

    let cc = bits
    switch (cc) {
      case 0:
        bits = 0
        maxpower = 2 ** 8
        power = 1
        while (power !== maxpower) {
          resb = data.val & data.position
          data.position >>= 1
          if (data.position === 0) {
            data.position = resetValue
            data.val = getNextValue(data.index++)
          }
          bits |= (resb > 0 ? 1 : 0) * power
          power <<= 1
        }
        dictionary[dictSize++] = String.fromCharCode(bits)
        cc = dictSize - 1
        enlargeIn--
        break
      case 1:
        bits = 0
        maxpower = 2 ** 16
        power = 1
        while (power !== maxpower) {
          resb = data.val & data.position
          data.position >>= 1
          if (data.position === 0) {
            data.position = resetValue
            data.val = getNextValue(data.index++)
          }
          bits |= (resb > 0 ? 1 : 0) * power
          power <<= 1
        }
        dictionary[dictSize++] = String.fromCharCode(bits)
        cc = dictSize - 1
        enlargeIn--
        break
      case 2:
        return result.join('')
    }

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits
      numBits++
    }

    if (dictionary[cc]) {
      entry = dictionary[cc]
    } else if (cc === dictSize) {
      entry = w + w.charAt(0)
    } else {
      return null
    }

    result.push(entry)
    dictionary[dictSize++] = w + entry.charAt(0)
    enlargeIn--
    w = entry

    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits
      numBits++
    }
  }
}
