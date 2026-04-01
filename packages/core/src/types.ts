// ============================================================
// Manifest — 数据源仓库的核心配置
// ============================================================

export interface Manifest {
  name: string
  description?: string
  /** 静态图片列表（由 Actions 爬取后自动维护，或手动添加） */
  images: ImageEntry[]
  /** 规则列表 */
  rules: Rule[]
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

export type Rule = JsonApiRule | CssSelectorRule | RssRule

export interface RuleBase {
  name: string
  /**
   * scheduled = 仅 GitHub Actions 定时执行
   * dynamic  = 仅 Worker 实时执行
   * both     = 两者皆可
   */
  mode: 'scheduled' | 'dynamic' | 'both'
  /** cron 表达式，仅 scheduled / both 模式有意义 */
  schedule?: string
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
