# ImageMainichi

每日随机图片服务 — 支持静态部署与动态 Cloudflare Workers 部署。

## 架构

```
┌─────────────────────────────────────────────────┐
│  Cloudflare Worker (动态模式)                     │
│  GET / → 302 随机图片                             │
│  GET /json → 图片元数据                           │
│  支持实时执行规则获取图片                           │
└──────────────┬──────────────────────────────────┘
               │ fetch manifest.json
               ▼
┌─────────────────────────────────────────────────┐
│  数据源仓库 (GitHub Repo)                         │
│  ├── manifest.json   ← 图片列表 + 规则定义         │
│  ├── images/         ← 静态图片文件                │
│  └── .github/workflows/crawl.yml                 │
│       └── GitHub Actions 定时执行规则爬取图片       │
└─────────────────────────────────────────────────┘
```

## 两种部署模式

| 模式 | 适用场景 | 规则执行方式 |
|------|---------|-------------|
| 静态 | GitHub Pages / 镜像站 | GitHub Actions 定时爬取，图片存入仓库 |
| 动态 | Cloudflare Workers | 请求时实时执行规则 + 静态图片混合 |

## 快速开始

### 1. 创建数据源仓库

从 `template/` 目录复制内容到新仓库，编辑 `manifest.json` 配置规则：

```json
{
  "name": "my-source",
  "images": [],
  "rules": [
    {
      "name": "example",
      "type": "json-api",
      "mode": "both",
      "url": "https://api.example.com/images",
      "imagePath": "$.data[*].url"
    }
  ]
}
```

### 2. 部署 Worker

```bash
# 克隆本仓库
git clone https://github.com/TrueRou/ImageMainichi.git
cd ImageMainichi

# 安装依赖
pnpm install

# 配置数据源（编辑 wrangler.toml 中的 SOURCES）
# 格式: [{"repo":"owner/repo"}]

# 本地开发
pnpm dev

# 部署到 Cloudflare
cd packages/worker && pnpm deploy
```

## 规则类型

### json-api
从 JSON API 提取图片 URL，使用 JSONPath 语法。

```json
{
  "type": "json-api",
  "url": "https://api.example.com/images",
  "headers": { "Authorization": "Bearer xxx" },
  "imagePath": "$.data[*].image_url"
}
```

### css-selector
从 HTML 页面用 CSS 选择器提取图片。

```json
{
  "type": "css-selector",
  "url": "https://example.com/gallery",
  "selector": "img.gallery-item",
  "attribute": "src"
}
```

### rss
从 RSS/Atom feed 提取图片。

```json
{
  "type": "rss",
  "url": "https://example.com/feed.xml",
  "imageFrom": "enclosure"
}
```

## 规则执行模式

每条规则的 `mode` 字段控制执行方式：

- `scheduled` — 仅由 GitHub Actions 定时执行，图片下载到仓库
- `dynamic` — 仅由 Worker 在请求时实时执行
- `both` — 两者皆可

## API

| 端点 | 说明 |
|------|------|
| `GET /` | 302 重定向到随机图片 |
| `GET /json` | 返回随机图片 JSON `{ url, tags, source }` |
| `GET /?tag=xxx` | 按标签过滤 |
| `GET /health` | 健康检查 |

## 项目结构

```
packages/
├── core/     # 共享类型 + 规则引擎
├── worker/   # Cloudflare Workers API
└── action/   # GitHub Action 定时爬取
template/     # 数据源仓库模板
```

