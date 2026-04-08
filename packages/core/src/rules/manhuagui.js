import { parse } from 'node-html-parser';
const DESKTOP_ROOT = 'https://www.manhuagui.com';
const IMAGE_HOST = 'https://i.hamreus.com';
const MANHUAGUI_HEADERS = {
    Referer: `${DESKTOP_ROOT}/`,
    'User-Agent': 'Mozilla/5.0',
};
export async function executeManhuaguiRule(rule, fetch) {
    const comicUrl = toDesktopComicUrl(rule.url);
    const chapterUrls = await loadChapterUrls(comicUrl, fetch);
    const targets = rule.scope === 'latest-chapter'
        ? chapterUrls.slice(0, 1)
        : chapterUrls;
    const allImages = await Promise.all(targets.map((url) => loadChapterImages(url, fetch)));
    return Array.from(new Set(allImages.flat()));
}
async function loadChapterUrls(comicUrl, fetch) {
    const res = await fetch(comicUrl, { headers: MANHUAGUI_HEADERS });
    if (!res.ok) {
        throw new Error(`manhuagui rule: failed to load comic page ${comicUrl}: HTTP ${res.status}`);
    }
    const html = await res.text();
    const root = parse(html);
    const links = root.querySelectorAll('#chapter-list-0 a, #chapterList a');
    const chapterUrls = links
        .map((link) => link.getAttribute('href'))
        .filter((href) => Boolean(href))
        .map((href) => new URL(href, DESKTOP_ROOT).href);
    if (chapterUrls.length === 0) {
        throw new Error('manhuagui rule: no chapters found');
    }
    return chapterUrls;
}
async function loadChapterImages(chapterUrl, fetch) {
    const res = await fetch(chapterUrl, { headers: MANHUAGUI_HEADERS });
    if (!res.ok) {
        throw new Error(`manhuagui rule: failed to load chapter page ${chapterUrl}: HTTP ${res.status}`);
    }
    const html = await res.text();
    const packed = extractPackedScript(html);
    const data = decodePackedData(packed);
    const path = typeof data.path === 'string' ? data.path : '';
    const files = Array.isArray(data.files) ? data.files.filter((value) => typeof value === 'string') : [];
    const query = buildQuery(data.sl);
    if (files.length === 0) {
        throw new Error(`manhuagui rule: no image files found in ${chapterUrl}`);
    }
    return files.map((file) => `${IMAGE_HOST}${path}${file}${query}`);
}
function toDesktopComicUrl(url) {
    const parsed = new URL(url);
    parsed.protocol = 'https:';
    parsed.hostname = 'www.manhuagui.com';
    return parsed.href;
}
function extractPackedScript(html) {
    const match = html.match(/window\["\\x65\\x76\\x61\\x6c"\]\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('(.*)',(\d+),(\d+),'([\s\S]*?)'\['\\x73\\x70\\x6c\\x69\\x63'\]\('\\x7c'\),0,\{\}\)\)/);
    if (!match) {
        throw new Error('manhuagui rule: packed chapter payload not found');
    }
    const [, payload, base, count, dictionary] = match;
    return unpackPayload(payload, Number(base), Number(count), decompressDictionary(dictionary));
}
function unpackPayload(payload, base, count, dictionary) {
    let result = payload;
    for (let i = count - 1; i >= 0; i--) {
        const key = encodeNumber(i, base);
        const replacement = dictionary[i] || key;
        result = result.replace(new RegExp(`\\b${escapeRegExp(key)}\\b`, 'g'), replacement);
    }
    return result;
}
function encodeNumber(value, base) {
    return (value < base ? '' : encodeNumber(Math.floor(value / base), base)) + digit(value % base);
}
function digit(value) {
    return value > 35
        ? String.fromCharCode(value + 29)
        : '0123456789abcdefghijklmnopqrstuvwxyz'[value];
}
function decompressDictionary(input) {
    const decompressed = decompressFromBase64(input);
    if (decompressed == null) {
        throw new Error('manhuagui rule: failed to decompress chapter dictionary');
    }
    return decompressed.split('|');
}
function decodePackedData(script) {
    const match = script.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error('manhuagui rule: decoded chapter object not found');
    }
    const normalized = match[0]
        .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
        .replace(/:\s*([A-Za-z_$][\w$]*)\b/g, ': "$1"');
    return JSON.parse(normalized);
}
function buildQuery(sl) {
    if (!sl || typeof sl !== 'object') {
        return '';
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sl)) {
        if (typeof value === 'string' && value) {
            params.set(key, value);
        }
    }
    const query = params.toString();
    return query ? `?${query}` : '';
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const keyStrBase64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function decompressFromBase64(input) {
    if (input == null)
        return '';
    if (input === '')
        return null;
    return _decompress(input.length, 32, (index) => getBaseValue(keyStrBase64, input.charAt(index)));
}
function getBaseValue(alphabet, character) {
    const index = alphabet.indexOf(character);
    if (index === -1) {
        throw new Error(`manhuagui rule: invalid base64 character "${character}"`);
    }
    return index;
}
function _decompress(length, resetValue, getNextValue) {
    const dictionary = [];
    let next;
    let enlargeIn = 4;
    let dictSize = 4;
    let numBits = 3;
    let entry = '';
    const result = [];
    let i;
    let w;
    let bits;
    let resb;
    let maxpower;
    let power;
    let c;
    const data = {
        val: getNextValue(0),
        position: resetValue,
        index: 1,
    };
    for (i = 0; i < 3; i++) {
        dictionary[i] = String(i);
    }
    bits = 0;
    maxpower = 2 ** 2;
    power = 1;
    while (power !== maxpower) {
        resb = data.val & data.position;
        data.position >>= 1;
        if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index++);
        }
        bits |= (resb > 0 ? 1 : 0) * power;
        power <<= 1;
    }
    switch (next = bits) {
        case 0:
            bits = 0;
            maxpower = 2 ** 8;
            power = 1;
            while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
            }
            c = String.fromCharCode(bits);
            break;
        case 1:
            bits = 0;
            maxpower = 2 ** 16;
            power = 1;
            while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                    data.position = resetValue;
                    data.val = getNextValue(data.index++);
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
            }
            c = String.fromCharCode(bits);
            break;
        case 2:
            return '';
        default:
            c = '';
    }
    dictionary[3] = c;
    w = c;
    result.push(c);
    while (true) {
        if (data.index > length) {
            return '';
        }
        bits = 0;
        maxpower = 2 ** numBits;
        power = 1;
        while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
        }
        let cc = bits;
        switch (cc) {
            case 0:
                bits = 0;
                maxpower = 2 ** 8;
                power = 1;
                while (power !== maxpower) {
                    resb = data.val & data.position;
                    data.position >>= 1;
                    if (data.position === 0) {
                        data.position = resetValue;
                        data.val = getNextValue(data.index++);
                    }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                dictionary[dictSize++] = String.fromCharCode(bits);
                cc = dictSize - 1;
                enlargeIn--;
                break;
            case 1:
                bits = 0;
                maxpower = 2 ** 16;
                power = 1;
                while (power !== maxpower) {
                    resb = data.val & data.position;
                    data.position >>= 1;
                    if (data.position === 0) {
                        data.position = resetValue;
                        data.val = getNextValue(data.index++);
                    }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                dictionary[dictSize++] = String.fromCharCode(bits);
                cc = dictSize - 1;
                enlargeIn--;
                break;
            case 2:
                return result.join('');
        }
        if (enlargeIn === 0) {
            enlargeIn = 2 ** numBits;
            numBits++;
        }
        if (dictionary[cc]) {
            entry = dictionary[cc];
        }
        else if (cc === dictSize) {
            entry = w + w.charAt(0);
        }
        else {
            return null;
        }
        result.push(entry);
        dictionary[dictSize++] = w + entry.charAt(0);
        enlargeIn--;
        w = entry;
        if (enlargeIn === 0) {
            enlargeIn = 2 ** numBits;
            numBits++;
        }
    }
}
//# sourceMappingURL=manhuagui.js.map