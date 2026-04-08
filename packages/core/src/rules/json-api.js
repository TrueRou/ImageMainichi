/**
 * 执行 JSON API 规则：请求 API → 用 JSONPath 提取图片 URL
 * 支持简单的 JSONPath 语法：$.data[*].url 或 $.items[*].image
 */
export async function executeJsonApiRule(rule, fetch) {
    const res = await fetch(rule.url, {
        headers: rule.headers ?? {},
    });
    if (!res.ok) {
        throw new Error(`json-api rule "${rule.name}": HTTP ${res.status}`);
    }
    const json = await res.json();
    return extractByPath(json, rule.imagePath);
}
/**
 * 简易 JSONPath 实现，支持：
 *   $.key1.key2          → 嵌套取值
 *   $.key1[*].key2       → 遍历数组中每个元素的 key2
 *   $.key1[0].key2       → 取数组指定索引
 */
function extractByPath(data, path) {
    const segments = parsePath(path);
    const results = [];
    resolve(data, segments, 0, results);
    return results.filter((v) => typeof v === 'string' && v.length > 0);
}
function parsePath(path) {
    // 去掉开头的 "$."
    const normalized = path.startsWith('$.') ? path.slice(2) : path;
    const segments = [];
    for (const part of normalized.split('.')) {
        const bracketMatch = part.match(/^(\w+)\[(\*|\d+)\]$/);
        if (bracketMatch) {
            segments.push({
                key: bracketMatch[1],
                index: bracketMatch[2] === '*' ? '*' : parseInt(bracketMatch[2], 10),
            });
        }
        else {
            segments.push({ key: part });
        }
    }
    return segments;
}
function resolve(data, segments, depth, results) {
    if (depth >= segments.length) {
        if (typeof data === 'string')
            results.push(data);
        return;
    }
    if (!data || typeof data !== 'object')
        return;
    const seg = segments[depth];
    const value = data[seg.key];
    if (seg.index === undefined) {
        resolve(value, segments, depth + 1, results);
    }
    else if (seg.index === '*') {
        if (Array.isArray(value)) {
            for (const item of value) {
                resolve(item, segments, depth + 1, results);
            }
        }
    }
    else {
        if (Array.isArray(value) && seg.index < value.length) {
            resolve(value[seg.index], segments, depth + 1, results);
        }
    }
}
//# sourceMappingURL=json-api.js.map