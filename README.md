# ImageMainichi

每日随机图片服务，支持两种执行模式：

- **crawl**：规则保存在数据源仓库的 `rules/*.json`，由 GitHub Actions 定时抓取图片并写入公开 `manifest.json` 与 `images/`
- **on-demand**：Worker 在请求时读取公开 `manifest.json`，并额外加载数据源仓库中的 `rules/*.json` 执行 `on-demand` 规则

## 执行模式总览

| 模式        | 核心思路              | 运行位置           | 图片来源                | 适用场景                                     |
|-------------|-----------------------|--------------------|-------------------------|----------------------------------------------|
| `crawl`     | 预先抓取、预先保存     | GitHub Actions     | 仓库中的 `images/`      | GitHub Pages、纯静态托管、希望结果可审计可回溯 |
| `on-demand` | 请求时抓取、请求时计算 | Cloudflare Workers | 静态图片 + 实时规则结果 | 需要在线接口、随机分发、按标签过滤、实时更新    |

## 架构

```text
┌─────────────────────────────────────────────────┐
│  GitHub Actions（crawl）                         │
│  读取 rules/*.json                              │
│  执行 crawl 规则                                 │
│  下载图片到 images/                              │
│  更新公开 manifest.json                          │
└──────────────┬──────────────────────────────────┘
               │ push repo contents
               ▼
┌─────────────────────────────────────────────────┐
│  数据源仓库                                      │
│  ├── manifest.json   ← 公开：图片列表            │
│  ├── images/         ← 公开：静态图片文件         │
│  ├── rules/*.json    ← 规则配置                   │
│  └── .github/workflows/crawl.yml                │
└─────────────────────────────────────────────────┘
```

## crawl 模式

`crawl` 模式下，规则不会在用户请求时执行，而是由数据源仓库中的 GitHub Actions 定时运行：

1. 读取 `manifest.json`
2. 读取 `rules/*.json`
3. 执行 `crawl` 规则
4. 下载图片到 `images/`
5. 回写并提交最新的 `manifest.json`

## on-demand 模式

`on-demand` 模式下，Cloudflare Worker 会在收到请求时：

1. 拉取数据源仓库中的公开 `manifest.json`
2. 拉取数据源仓库中的 `rules/*.json`
3. 读取静态图片列表
4. 实时执行其中的 `on-demand` 规则
5. 将静态图片与动态结果合并后返回随机结果

## 快速开始

### 1. 创建数据源仓库

先安装依赖并构建 CLI：

```bash
pnpm install
pnpm build
```

然后用 CLI 初始化一个新的数据源目录：

```bash
pnpm cli init my-source --name my-image-source
```

生成后的目录结构如下：

```text
.
├── manifest.json
├── images/
├── rules/
│   └── example.json
└── .github/workflows/crawl.yml
```

### 2. 配置规则

在 `rules/` 目录下为每条规则创建一个 JSON 文件。

`rules/example-crawl.json`：

```json
{
  "name": "example-crawl",
  "type": "json-api",
  "mode": "crawl",
  "schedule": "0 0 * * *",
  "url": "https://api.example.com/images",
  "imagePath": "$.data[*].url"
}
```

### 3. 启用 GitHub Actions

工作流会自动：

- 读取 `rules/*.json`
- 执行 `crawl` 规则
- 下载图片到 `images/`
- 更新公开 `manifest.json`


### 6. 本地测试单条规则

推荐直接使用 CLI 在数据源仓库本地测试某条规则，不会下载图片，也不会修改 `manifest.json`：

```bash
pnpm cli rule list --work-dir ./template
pnpm cli rule test example-rule --work-dir ./template --download
```

可选参数：

- `--work-dir <path>`：数据源仓库目录，默认当前目录
- `--limit <n>`：限制输出的图片 URL 数量
- `--json`：以 JSON 输出结果
- `--list`：列出当前 `rules/*.json` 中的可选规则
- `--download`：下载图片到 `images/`（本地测试时使用）

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

### manhuagui
从看漫画作品页提取图片，支持最新章节全部页或所有章节全部页。

```json
{
  "type": "manhuagui",
  "url": "https://m.manhuagui.com/comic/58997/",
  "scope": "latest-chapter"
}
```

`scope` 支持两种取值：

- `latest-chapter`：抓取最新章节全部页
- `all-chapters`：抓取所有章节全部页

## 规则模式

每条规则的 `mode` 字段支持两种取值：

- `crawl` — 由 GitHub Actions 定时执行，结果写入公开仓库
- `on-demand` — 由 Worker 在请求时实时执行

## Worker API

| 端点            | 说明                                      |
|-----------------|-------------------------------------------|
| `GET /`         | 302 重定向到随机图片                      |
| `GET /json`     | 返回随机图片 JSON `{ url, tags, source }` |
| `GET /?tag=xxx` | 按标签过滤                                |
| `GET /health`   | 健康检查                                  |

## 项目结构

```text
packages/
├── core/     # 共享类型 + manifest/rule 校验 + 规则引擎
├── node/     # Node 侧共享逻辑：规则发现、测试、crawl、模板初始化
├── cli/      # 面向用户的 Node CLI
├── worker/   # Cloudflare Workers API
└── action/   # GitHub Action 适配层
template/     # 数据源仓库模板
```
