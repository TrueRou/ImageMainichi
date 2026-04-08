/**
 * 执行 RSS/Atom 规则：请求 feed → 根据策略提取图片 URL
 * 使用正则解析 XML，避免引入重量级 XML 解析器
 */
export async function executeRssRule(rule, fetch) {
    const res = await fetch(rule.url);
    if (!res.ok) {
        throw new Error(`rss rule "${rule.name}": HTTP ${res.status}`);
    }
    const xml = await res.text();
    const urls = [];
    switch (rule.imageFrom) {
        case 'enclosure':
            urls.push(...extractEnclosures(xml));
            break;
        case 'media:content':
            urls.push(...extractMediaContent(xml));
            break;
        case 'content-img':
            urls.push(...extractContentImages(xml));
            break;
    }
    return urls;
}
/** 从 <enclosure url="..." type="image/..."> 提取 */
function extractEnclosures(xml) {
    const urls = [];
    const regex = /<enclosure[^>]+url=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        // 只取图片类型的 enclosure
        const tag = match[0];
        if (!tag.includes('type=') || /type=["']image\//i.test(tag)) {
            urls.push(match[1]);
        }
    }
    return urls;
}
/** 从 <media:content url="..."> 提取 */
function extractMediaContent(xml) {
    const urls = [];
    const regex = /<media:content[^>]+url=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = regex.exec(xml)) !== null) {
        urls.push(match[1]);
    }
    return urls;
}
/** 从 <content> 或 <description> 中的 <img src="..."> 提取 */
function extractContentImages(xml) {
    const urls = [];
    // 匹配 CDATA 或普通内容中的 img 标签
    const contentRegex = /<(?:content|description)[^>]*>([\s\S]*?)<\/(?:content|description)>/gi;
    let contentMatch;
    while ((contentMatch = contentRegex.exec(xml)) !== null) {
        const content = contentMatch[1]
            .replace(/^<!\[CDATA\[/, '')
            .replace(/\]\]>$/, '');
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        let imgMatch;
        while ((imgMatch = imgRegex.exec(content)) !== null) {
            urls.push(imgMatch[1]);
        }
    }
    return urls;
}
//# sourceMappingURL=rss.js.map