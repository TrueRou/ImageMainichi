// ============================================================
// Manifest — 数据源仓库的核心配置
// ============================================================

export interface Manifest {
  name: string
  description?: string
  /** 静态图片列表（由 Actions 爬取后自动维护，或手动添加） */
  images: ImageEntry[]
}

export interface ImageEntry {
  /** 相对路径 "images/001.jpg" 或完整 URL */
  url: string
  tags?: string[]
  addedAt?: string
}

// ============================================================
// Rules — 规则定义
// ============================================================

export type Rule = JsonApiRule | CssSelectorRule | RssRule | ManhuaguiRule

export interface RuleBase {
  name: string
  /**
   * crawl     = 仅 GitHub Actions 定时执行
   * on-demand = 仅 Worker 请求时执行
   */
  mode: 'crawl' | 'on-demand'
}

export interface JsonApiRule extends RuleBase {
  type: 'json-api'
  /** API 端点 */
  url: string
  headers?: Record<string, string>
  /** JSONPath 表达式，提取图片 URL 数组，e.g. "$.data[*].image_url" */
  imagePath: string
}

export interface CssSelectorRule extends RuleBase {
  type: 'css-selector'
  url: string
  /** CSS 选择器，e.g. "img.gallery-item" */
  selector: string
  /** 要提取的属性名，e.g. "src", "data-src" */
  attribute: string
}

export interface RssRule extends RuleBase {
  type: 'rss'
  url: string
  /** 从 RSS item 中提取图片的方式 */
  imageFrom: 'enclosure' | 'media:content' | 'content-img'
}

export interface ManhuaguiRule extends RuleBase {
  type: 'manhuagui'
  /** 看漫画作品页 URL，例如 https://m.manhuagui.com/comic/58997/ */
  url: string
  /** latest-chapter = 最新章节全部页；all-chapters = 所有章节全部页 */
  scope: 'latest-chapter' | 'all-chapters'
}

// ============================================================
// Worker 配置
// ============================================================

export interface SourceConfig {
  /** GitHub 仓库，格式 "owner/repo" 或 "owner/repo@branch" */
  repo: string
  /** 自定义 raw 基础 URL（用于镜像 / 自托管） */
  rawBaseUrl?: string
}

// ============================================================
// Fetcher — 平台无关的 fetch 抽象
// ============================================================

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

// ============================================================
// RuleResult — 规则执行结果
// ============================================================

export interface RuleResult {
  imageUrls: string[]
  /** 下载图片时需要携带的 headers（如防盗链 Referer） */
  downloadHeaders?: Record<string, string>
}
