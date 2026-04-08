import { parse } from 'node-html-parser';
/**
 * 执行 CSS 选择器规则：请求 HTML → 用选择器提取指定属性
 */
export async function executeCssSelectorRule(rule, fetch) {
    const res = await fetch(rule.url);
    if (!res.ok) {
        throw new Error(`css-selector rule "${rule.name}": HTTP ${res.status}`);
    }
    const html = await res.text();
    const root = parse(html);
    const elements = root.querySelectorAll(rule.selector);
    const urls = [];
    for (const el of elements) {
        const value = el.getAttribute(rule.attribute);
        if (value) {
            // 处理相对 URL
            urls.push(resolveUrl(value, rule.url));
        }
    }
    return urls;
}
function resolveUrl(value, baseUrl) {
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//')) {
        return value.startsWith('//') ? `https:${value}` : value;
    }
    try {
        return new URL(value, baseUrl).href;
    }
    catch {
        return value;
    }
}
//# sourceMappingURL=css.js.map