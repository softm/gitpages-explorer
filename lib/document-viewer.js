(function (window, document) {
    const officeDocumentExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
    const inlinePdfExtensions = new Set(['pdf']);
    const zipTextExtensions = new Set([]);
    const hwpxDocumentExtensions = new Set(['hwpx']);
    const archiveExtensions = new Set(['zip']);
    const archivePreviewTextExtensions = new Set([
        'txt', 'csv', 'md', 'json', 'xml', 'html', 'htm', 'css', 'js', 'mjs',
        'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go',
        'rs', 'php', 'rb', 'sh', 'yml', 'yaml', 'toml', 'ini', 'log', 'sql'
    ]);
    const archivePreviewImageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']);
    const archivePreviewPdfExtensions = new Set(['pdf']);
    const hwpHtmlExtensions = new Set(['hwp']);
    const HWPJS_CDN_URL = 'https://esm.sh/@ohah/hwpjs?bundle';
    const EMU_PER_INCH = 914400;
    const DEFAULT_SLIDE_WIDTH = 12192000;
    const DEFAULT_SLIDE_HEIGHT = 6858000;
    const documentViewerIcons = {
        zoomIn: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 8v6M8 11h6M16 16l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        zoomOut: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11h6M16 16l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        reset: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 1 2.35 5.65" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 18v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        fullscreenEnter: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        fullscreenExit: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' // SOFTM-compact-viewer-toolbar 2026-05-16: 공통 뷰어 아이콘 기본 크기를 고정해 버튼 영역 확대를 방지
    };
    let hwpjsModulePromise = null;

    function isLocalPage() {
        return window.location.protocol === 'file:'
            || window.location.hostname === 'localhost'
            || window.location.hostname === '127.0.0.1'
            || window.location.hostname === '::1';
    }

    function buildAbsoluteUrl(url) {
        try {
            return new URL(url, window.location.href).href;
        } catch (error) {
            return url;
        }
    }

    function isPublicOfficeViewerSource(url) {
        try {
            const parsed = new URL(url, window.location.href);
            return /^https?:$/.test(parsed.protocol)
                && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
        } catch (error) {
            return false;
        }
    }

    function buildOfficeViewerUrl(fileUrl) {
        const absoluteUrl = buildAbsoluteUrl(fileUrl);
        if (!isPublicOfficeViewerSource(absoluteUrl)) {
            return '';
        }
        return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeOfficeViewerSource(absoluteUrl)}`;
    }

    function encodeOfficeViewerSource(url) {
        return encodeURIComponent(url).replace(/[!'()*]/g, (char) => (
            `%${char.charCodeAt(0).toString(16).toUpperCase()}`
        ));
    }

    function createFallback(pane, fileUrl, fileExt, message) {
        const fallback = document.createElement('div');
        fallback.className = 'directory-viewer-fallback';

        const badge = document.createElement('span');
        badge.className = 'file-badge document';
        badge.textContent = String(fileExt || 'file').toUpperCase();
        fallback.appendChild(badge);

        const info = document.createElement('p');
        info.textContent = message;
        fallback.appendChild(info);

        const link = document.createElement('a');
        link.href = fileUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '새 창에서 열기';
        fallback.appendChild(link);

        pane.appendChild(fallback);
    }

    function getFullscreenElement() {
        return document.fullscreenElement
            || document.webkitFullscreenElement
            || document.mozFullScreenElement
            || document.msFullscreenElement
            || null;
    }

    function requestFullscreen(element) {
        if (!element) {
            return Promise.reject(new Error('Fullscreen target is not available'));
        }
        const request = element.requestFullscreen
            || element.webkitRequestFullscreen
            || element.mozRequestFullScreen
            || element.msRequestFullscreen;
        if (!request) {
            return Promise.reject(new Error('Fullscreen API is not supported'));
        }
        return Promise.resolve(request.call(element));
    }

    function exitFullscreen() {
        const exit = document.exitFullscreen
            || document.webkitExitFullscreen
            || document.mozCancelFullScreen
            || document.msExitFullscreen;
        if (!exit) {
            return Promise.reject(new Error('Fullscreen exit API is not supported'));
        }
        return Promise.resolve(exit.call(document));
    }

    function createFullscreenButton(target, options) {
        const settings = options || {};
        const button = document.createElement('button');
        button.type = 'button';
        button.className = settings.className || 'directory-viewer-fullscreen-button';
        button.innerHTML = settings.enterIcon || documentViewerIcons.fullscreenEnter;
        button.title = settings.enterTitle || '전체화면으로 보기';
        button.setAttribute('aria-label', settings.enterText || '전체화면');
        button.setAttribute('aria-pressed', 'false');

        const getTarget = typeof target === 'function' ? target : () => target;
        let lastActive = null;
        const update = () => {
            const element = getTarget();
            const active = Boolean(element && (getFullscreenElement() === element || element.classList.contains('is-pseudo-fullscreen')));
            button.innerHTML = active
                ? (settings.exitIcon || documentViewerIcons.fullscreenExit)
                : (settings.enterIcon || documentViewerIcons.fullscreenEnter);
            button.title = active ? (settings.exitTitle || '전체화면 나가기') : (settings.enterTitle || '전체화면으로 보기');
            button.setAttribute('aria-label', active ? (settings.exitText || '전체화면 나가기') : (settings.enterText || '전체화면'));
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
            if (typeof settings.onChange === 'function' && active !== lastActive) {
                settings.onChange(active, element);
            }
            lastActive = active;
        };

        button.addEventListener('click', () => {
            const element = getTarget();
            if (!element) {
                return;
            }
            if (element.classList.contains('is-pseudo-fullscreen')) {
                element.classList.remove('is-pseudo-fullscreen');
                update();
                return;
            }
            if (getFullscreenElement() === element) {
                exitFullscreen()
                    .catch(error => console.error('Error attempting to exit fullscreen:', error))
                    .finally(update);
                return;
            }
            requestFullscreen(element)
                .catch(error => {
                    console.error('Error attempting to enable fullscreen:', error);
                    element.classList.add('is-pseudo-fullscreen');
                })
                .finally(update);
        });
        document.addEventListener('keydown', event => {
            const element = getTarget();
            if (event.key === 'Escape' && element && element.classList.contains('is-pseudo-fullscreen')) {
                element.classList.remove('is-pseudo-fullscreen');
                update();
            }
        });
        document.addEventListener('fullscreenchange', update);
        document.addEventListener('webkitfullscreenchange', update);
        document.addEventListener('mozfullscreenchange', update);
        document.addEventListener('MSFullscreenChange', update);
        update();
        return button;
    }

    function renderOfficeDocument(pane, fileUrl, fileExt) {
        const viewerUrl = buildOfficeViewerUrl(fileUrl);
        if (!viewerUrl) {
            createFallback(
                pane,
                fileUrl,
                fileExt,
                'Office Online 뷰어는 공개 HTTPS/HTTP URL만 열 수 있습니다. 로컬에서는 원본 파일을 새 창에서 열거나 배포 후 다시 확인하세요.'
            );
            return true;
        }

        const iframe = document.createElement('iframe');
        iframe.title = 'Office document viewer';
        iframe.src = viewerUrl;
        iframe.loading = 'lazy';
        pane.appendChild(iframe);
        return true;
    }

    function renderInlineFrame(pane, fileUrl, title) {
        const iframe = document.createElement('iframe');
        iframe.title = title || 'Document viewer';
        iframe.src = fileUrl;
        iframe.loading = 'lazy';
        pane.appendChild(iframe);
        return iframe;
    }

    function createTextViewer(pane) {
        pane.classList.add('directory-viewer-pane--markdown');
        const viewer = document.createElement('pre');
        viewer.className = 'markdown-source-code';
        viewer.textContent = '문서를 불러오는 중입니다.';
        pane.appendChild(viewer);
        return viewer;
    }

    function encodePath(path) {
        return String(path || '')
            .split('/')
            .map(part => encodeURIComponent(part))
            .join('/');
    }

    function previewTextPathFromMeta(meta) {
        const preview = meta && meta.preview;
        if (preview && preview.available && preview.kind === 'text' && preview.path) {
            return preview.path;
        }
        return '';
    }

    async function renderTextPreview(pane, previewPath) {
        const viewer = createTextViewer(pane);
        try {
            const response = await fetch(encodePath(previewPath));
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            viewer.textContent = normalizeText(await response.text()) || '추출된 텍스트가 없습니다.';
        } catch (error) {
            viewer.textContent = '문서 프리뷰를 불러오지 못했습니다.';
        }
    }

    function createMessage(pane, message) {
        pane.classList.add('directory-viewer-pane--markdown');
        const viewer = document.createElement('pre');
        viewer.className = 'markdown-source-code';
        viewer.textContent = message;
        pane.appendChild(viewer);
        return viewer;
    }

    function loadHwpjs() {
        if (!hwpjsModulePromise) {
            hwpjsModulePromise = import(HWPJS_CDN_URL);
        }
        return hwpjsModulePromise;
    }

    function getToHtml(module) {
        return module && (
            module.toHtml
            || (module.Hwpjs && module.Hwpjs.toHtml)
            || (module.default && module.default.toHtml)
        );
    }

    function extractHtmlPart(html, tagName) {
        const match = String(html || '').match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
        return match ? match[1] : '';
    }

    function buildHwpViewerHtml(html) {
        const htmlText = String(html || '');
        const headContent = extractHtmlPart(htmlText, 'head');
        const bodyContent = extractHtmlPart(htmlText, 'body') || htmlText;
        return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${headContent}
<style>
html,
body {
    width: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
    background: #f3f6fb;
    overflow: auto;
}
body {
    box-sizing: border-box;
    padding: 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.hwp-viewer-root {
    width: max-content;
    min-width: 100%;
    margin: 0 auto;
    transform-origin: top left;
}
.hwp-viewer-root *,
.hwp-viewer-root *::before,
.hwp-viewer-root *::after {
    box-sizing: border-box;
}
.hwp-viewer-root > * {
    margin-left: auto !important;
    margin-right: auto !important;
}
.hwp-viewer-root [class*="page"],
.hwp-viewer-root [class*="Page"],
.hwp-viewer-root [class*="paper"],
.hwp-viewer-root [class*="Paper"] {
    background: #fff;
    box-shadow: 0 1px 8px rgba(15, 23, 42, 0.14);
}
.hwp-viewer-root img,
.hwp-viewer-root svg,
.hwp-viewer-root canvas {
    max-width: 100%;
    height: auto;
}
</style>
</head>
<body>
<div class="hwp-viewer-root">${bodyContent}</div>
</body>
</html>`;
    }

    function fitHwpIframe(iframe) {
        const doc = iframe.contentDocument;
        if (!doc) {
            return;
        }

        const root = doc.querySelector('.hwp-viewer-root');
        if (!root) {
            return;
        }

        root.style.transform = '';
        root.style.width = 'max-content';
        root.style.minHeight = '';

        const docWidth = doc.documentElement.clientWidth;
        const availableWidth = Math.max(120, docWidth - 20);
        const contentWidth = Math.max(
            root.scrollWidth,
            root.getBoundingClientRect().width,
            ...Array.from(root.children).map((child) => child.getBoundingClientRect().width)
        );
        const scale = contentWidth > availableWidth ? availableWidth / contentWidth : 1;

        root.style.transform = scale < 1 ? `scale(${scale})` : '';
        root.style.width = scale < 1 ? `${contentWidth}px` : '100%';
        root.style.minHeight = scale < 1 ? `${root.scrollHeight * scale}px` : '';
        doc.body.style.overflowX = scale < 1 ? 'hidden' : 'auto';
    }

    function scheduleHwpIframeFit(iframe) {
        const run = () => fitHwpIframe(iframe);
        iframe.addEventListener('load', () => {
            run();
            setTimeout(run, 50);
            setTimeout(run, 250);
        });
        if (window.ResizeObserver) {
            const observer = new ResizeObserver(run);
            observer.observe(iframe);
        } else {
            window.addEventListener('resize', run);
        }
    }

    function renderHtmlDocument(pane, html) {
        const iframe = document.createElement('iframe');
        iframe.title = 'HWP document viewer';
        iframe.className = 'hwp-document-frame';
        iframe.srcdoc = buildHwpViewerHtml(html);
        iframe.sandbox = 'allow-same-origin';
        iframe.loading = 'lazy';
        scheduleHwpIframeFit(iframe);
        pane.appendChild(iframe);
    }

    async function renderHwp(pane, fileUrl) {
        const status = createMessage(pane, 'HWP 뷰어를 불러오는 중입니다.');
        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            status.textContent = 'HWP 문서를 변환하는 중입니다.';
            const data = new Uint8Array(await response.arrayBuffer());
            const hwpjs = await loadHwpjs();
            const toHtml = getToHtml(hwpjs);
            if (typeof toHtml !== 'function') {
                throw new Error('HWPJS toHtml API not found');
            }

            const html = toHtml(data, {
                includeVersion: false,
                includePageInfo: false,
                cssClassPrefix: 'hwpjs-'
            });
            pane.innerHTML = '';
            renderHtmlDocument(pane, html);
        } catch (error) {
            pane.innerHTML = '';
            createFallback(
                pane,
                fileUrl,
                'hwp',
                'HWP 문서를 브라우저에서 변환하지 못했습니다. 네트워크 연결 또는 문서 형식을 확인하세요.'
            );
        }
    }

    function readUint16(view, offset) {
        return view.getUint16(offset, true);
    }

    function readUint32(view, offset) {
        return view.getUint32(offset, true);
    }

    function findEndOfCentralDirectory(view) {
        const minOffset = Math.max(0, view.byteLength - 65557);
        for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
            if (readUint32(view, offset) === 0x06054b50) {
                return offset;
            }
        }
        throw new Error('ZIP directory not found');
    }

    async function inflateRaw(bytes) {
        if (!('DecompressionStream' in window)) {
            throw new Error('DecompressionStream is not supported');
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    function decodeZipFileName(bytes, utf8) {
        if (utf8) {
            return new TextDecoder('utf-8').decode(bytes);
        }
        try {
            return new TextDecoder('euc-kr').decode(bytes);
        } catch (error) {
            return new TextDecoder('utf-8').decode(bytes);
        }
    }

    async function readZipEntries(buffer) {
        const view = new DataView(buffer);
        const eocdOffset = findEndOfCentralDirectory(view);
        const entryCount = readUint16(view, eocdOffset + 10);
        let centralOffset = readUint32(view, eocdOffset + 16);
        const entries = new Map();

        for (let index = 0; index < entryCount; index += 1) {
            if (readUint32(view, centralOffset) !== 0x02014b50) {
                throw new Error('Invalid ZIP central directory');
            }

            const flags = readUint16(view, centralOffset + 8);
            const method = readUint16(view, centralOffset + 10);
            const compressedSize = readUint32(view, centralOffset + 20);
            const uncompressedSize = readUint32(view, centralOffset + 24);
            const fileNameLength = readUint16(view, centralOffset + 28);
            const extraLength = readUint16(view, centralOffset + 30);
            const commentLength = readUint16(view, centralOffset + 32);
            const localOffset = readUint32(view, centralOffset + 42);
            const fileNameBytes = new Uint8Array(buffer, centralOffset + 46, fileNameLength);
            const fileName = decodeZipFileName(fileNameBytes, Boolean(flags & 0x0800));

            if (readUint32(view, localOffset) !== 0x04034b50) {
                throw new Error('Invalid ZIP local header');
            }

            const localNameLength = readUint16(view, localOffset + 26);
            const localExtraLength = readUint16(view, localOffset + 28);
            const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
            const compressed = new Uint8Array(buffer, dataOffset, compressedSize);

            const readEntry = async () => {
                if (method === 0) {
                    return compressed;
                }
                if (method === 8) {
                    return inflateRaw(compressed);
                }
                throw new Error(`Unsupported ZIP compression method: ${method}`);
            };
            readEntry.fileName = fileName;
            readEntry.compressedSize = compressedSize;
            readEntry.uncompressedSize = uncompressedSize;
            readEntry.isDirectory = fileName.endsWith('/');
            entries.set(fileName, readEntry);

            centralOffset += 46 + fileNameLength + extraLength + commentLength;
        }

        return entries;
    }

    function xmlText(xml, tags) {
        const parsed = new DOMParser().parseFromString(xml, 'application/xml');
        return Array.from(parsed.getElementsByTagName('*'))
            .filter(node => tags.has(node.localName.toLowerCase()))
            .map(node => (node.textContent || '').trim())
            .filter(Boolean);
    }

    function parseXml(xml) {
        return new DOMParser().parseFromString(xml, 'application/xml');
    }

    function childElements(node, localName) {
        return Array.from(node ? node.children : [])
            .filter(child => child.localName === localName);
    }

    function firstDescendant(node, localName) {
        return Array.from(node ? node.getElementsByTagName('*') : [])
            .find(child => child.localName === localName) || null;
    }

    function readShapeBounds(shape) {
        const xfrm = firstDescendant(shape, 'xfrm');
        const off = firstDescendant(xfrm, 'off');
        const ext = firstDescendant(xfrm, 'ext');
        return {
            x: Number(off && off.getAttribute('x') || 0),
            y: Number(off && off.getAttribute('y') || 0),
            cx: Number(ext && ext.getAttribute('cx') || 0),
            cy: Number(ext && ext.getAttribute('cy') || 0)
        };
    }

    function textFromParagraph(paragraph) {
        const parts = [];
        Array.from(paragraph.getElementsByTagName('*')).forEach(node => {
            if (node.localName === 't' && node.textContent) {
                parts.push(node.textContent);
            } else if (node.localName === 'br') {
                parts.push('\n');
            }
        });
        return parts.join('').trim();
    }

    function textRunsFromShape(shape) {
        const textBody = childElements(shape, 'txBody')[0];
        if (!textBody) {
            return [];
        }
        return childElements(textBody, 'p')
            .map(textFromParagraph)
            .filter(Boolean);
    }

    function colorFromShape(shape) {
        const solidFill = firstDescendant(shape, 'solidFill');
        const srgb = firstDescendant(solidFill, 'srgbClr');
        return srgb && srgb.getAttribute('val') ? `#${srgb.getAttribute('val')}` : '#111827';
    }

    function fontSizeFromShape(shape) {
        const runProps = firstDescendant(shape, 'rPr');
        const rawSize = Number(runProps && runProps.getAttribute('sz') || 0);
        if (rawSize > 0) {
            return Math.max(10, rawSize / 100);
        }
        return 18;
    }

    function parseSlideSize(entries, decoder) {
        const fallback = { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };
        const readPresentation = entries.get('ppt/presentation.xml');
        if (!readPresentation) {
            return Promise.resolve(fallback);
        }
        return readPresentation()
            .then(bytes => {
                const doc = parseXml(decoder.decode(bytes));
                const sldSz = firstDescendant(doc, 'sldSz');
                return {
                    width: Number(sldSz && sldSz.getAttribute('cx') || fallback.width),
                    height: Number(sldSz && sldSz.getAttribute('cy') || fallback.height)
                };
            })
            .catch(() => fallback);
    }

    function slideNumber(name) {
        return Number((name.match(/slide(\d+)\.xml/i) || [0, 0])[1]);
    }

    async function parsePptxSlides(entries) {
        const decoder = new TextDecoder('utf-8');
        const slideSize = await parseSlideSize(entries, decoder);
        const slideNames = Array.from(entries.keys())
            .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
            .sort((a, b) => slideNumber(a) - slideNumber(b));

        const slides = [];
        for (const name of slideNames) {
            const xml = decoder.decode(await entries.get(name)());
            const doc = parseXml(xml);
            const shapes = Array.from(doc.getElementsByTagName('*'))
                .filter(node => node.localName === 'sp')
                .map(shape => ({
                    bounds: readShapeBounds(shape),
                    paragraphs: textRunsFromShape(shape),
                    color: colorFromShape(shape),
                    fontSize: fontSizeFromShape(shape)
                }))
                .filter(shape => shape.paragraphs.length);
            slides.push({ number: slideNumber(name), shapes });
        }
        return { slideSize, slides };
    }

    function renderPptxSlide(container, slide, slideSize) {
        const frame = document.createElement('section');
        const ratio = slideSize.height > 0 && slideSize.width > 0
            ? slideSize.height / slideSize.width
            : DEFAULT_SLIDE_HEIGHT / DEFAULT_SLIDE_WIDTH;
        frame.style.position = 'relative';
        frame.style.width = 'min(100%, 1120px)';
        frame.style.height = `clamp(240px, ${Math.round(ratio * 100)}vw, 680px)`;
        frame.style.minHeight = '200px';
        frame.style.margin = '0 auto';
        frame.style.aspectRatio = `${slideSize.width} / ${slideSize.height}`;
        frame.style.background = '#fff';
        frame.style.border = '1px solid #d7deea';
        frame.style.borderRadius = '6px';
        frame.style.boxShadow = '0 10px 28px rgba(15, 23, 42, 0.12)';
        frame.style.overflow = 'hidden';

        const label = document.createElement('div');
        label.textContent = `Slide ${slide.number}`;
        label.style.position = 'absolute';
        label.style.right = '10px';
        label.style.bottom = '8px';
        label.style.color = '#9aa4b2';
        label.style.fontSize = '11px';
        label.style.zIndex = '2';
        frame.appendChild(label);

        slide.shapes.forEach(shape => {
            const { x, y, cx, cy } = shape.bounds;
            const box = document.createElement('div');
            box.style.position = 'absolute';
            box.style.left = `${(x / slideSize.width) * 100}%`;
            box.style.top = `${(y / slideSize.height) * 100}%`;
            box.style.width = `${(Math.max(cx, EMU_PER_INCH) / slideSize.width) * 100}%`;
            box.style.minHeight = `${(Math.max(cy, EMU_PER_INCH / 4) / slideSize.height) * 100}%`;
            box.style.color = shape.color;
            box.style.fontSize = `clamp(10px, ${(shape.fontSize / 18) * 1.2}vw, ${Math.max(shape.fontSize, 12)}px)`;
            box.style.lineHeight = '1.25';
            box.style.whiteSpace = 'pre-wrap';
            box.style.overflow = 'hidden';
            box.style.padding = '2px 4px';
            box.textContent = shape.paragraphs.join('\n');
            frame.appendChild(box);
        });

        container.appendChild(frame);
    }

    async function renderPptx(pane, fileUrl) {
        pane.classList.add('directory-viewer-pane--markdown');
        const wrapper = document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.minHeight = '0';
        wrapper.style.overflow = 'auto';
        wrapper.style.background = '#eef2f7';
        wrapper.style.padding = '18px';
        wrapper.style.boxSizing = 'border-box';
        wrapper.style.display = 'grid';
        wrapper.style.gridAutoRows = 'max-content';
        wrapper.style.gap = '18px';
        wrapper.style.alignContent = 'start';
        pane.appendChild(wrapper);

        const loading = document.createElement('div');
        loading.textContent = '문서를 불러오는 중입니다.';
        loading.style.color = '#4b5563';
        wrapper.appendChild(loading);

        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const entries = await readZipEntries(await response.arrayBuffer());
            const { slideSize, slides } = await parsePptxSlides(entries);
            wrapper.innerHTML = '';
            if (!slides.length) {
                loading.textContent = '표시할 슬라이드가 없습니다.';
                wrapper.appendChild(loading);
                return;
            }
            slides.forEach(slide => renderPptxSlide(wrapper, slide, slideSize));
        } catch (error) {
            pane.innerHTML = '';
            createFallback(pane, fileUrl, 'pptx', 'PPTX 문서를 브라우저에서 렌더링하지 못했습니다.');
        }
    }

    async function extractPptx(entries) {
        const decoder = new TextDecoder('utf-8');
        const slideNames = Array.from(entries.keys())
            .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
            .sort((a, b) => slideNumber(a) - slideNumber(b));
        const parts = [];

        for (const name of slideNames) {
            const xml = decoder.decode(await entries.get(name)());
            const values = xmlText(xml, new Set(['t']));
            if (values.length) {
                parts.push(`[Slide ${slideNumber(name)}]\n${values.join('\n')}`);
            }
        }
        return parts.join('\n\n');
    }

    async function extractHwpx(entries) {
        const decoder = new TextDecoder('utf-8');
        const previewTextEntry = entries.get('Preview/PrvText.txt') || entries.get('preview/prvtext.txt');
        if (previewTextEntry) {
            try {
                return decoder.decode(await previewTextEntry());
            } catch (error) {
                // Fall back to XML extraction below.
            }
        }

        const names = Array.from(entries.keys())
            .filter(name => {
                const normalized = name.toLowerCase();
                return /\.xml$/i.test(name)
                    && (
                        /^(contents|content)\//i.test(name)
                        || normalized.includes('/contents/')
                        || normalized.includes('/content/')
                        || normalized.includes('/section')
                        || normalized.endsWith('section0.xml')
                    );
            })
            .sort();
        const parts = [];

        for (const name of names) {
            const xml = decoder.decode(await entries.get(name)());
            const values = xmlText(xml, new Set(['t', 'text']));
            if (values.length) {
                parts.push(values.join('\n'));
            }
        }
        return parts.join('\n\n');
    }

    function findHwpxPreviewImage(entries) {
        return Array.from(entries.keys())
            .find(name => /^preview\/prvimage\.(png|jpe?g|webp|gif)$/i.test(name))
            || Array.from(entries.keys())
                .find(name => /^preview\//i.test(name) && /\.(png|jpe?g|webp|gif)$/i.test(name))
            || '';
    }

    function mimeFromImageName(name) {
        const ext = getFileExtension(name);
        if (ext === 'jpg' || ext === 'jpeg') {
            return 'image/jpeg';
        }
        if (ext === 'webp') {
            return 'image/webp';
        }
        if (ext === 'gif') {
            return 'image/gif';
        }
        return 'image/png';
    }

    async function renderHwpxDocument(pane, fileUrl) {
        pane.classList.add('directory-viewer-pane--markdown');
        const wrapper = document.createElement('div');
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.minHeight = '0';
        wrapper.style.overflow = 'auto';
        wrapper.style.background = '#eef2f7';
        wrapper.style.padding = '12px';
        wrapper.style.boxSizing = 'border-box';
        wrapper.style.display = 'grid';
        wrapper.style.gap = '12px';
        wrapper.style.alignContent = 'start';
        pane.appendChild(wrapper);

        const loading = document.createElement('div');
        loading.textContent = 'HWPX 문서를 불러오는 중입니다.';
        loading.style.color = '#4b5563';
        wrapper.appendChild(loading);

        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const entries = await readZipEntries(await response.arrayBuffer());
            const previewImageName = findHwpxPreviewImage(entries);
            const extracted = normalizeText(await extractHwpx(entries));
            wrapper.innerHTML = '';

            if (previewImageName && entries.get(previewImageName)) {
                const imageBytes = await entries.get(previewImageName)();
                const image = document.createElement('img');
                image.src = URL.createObjectURL(new Blob([imageBytes], { type: mimeFromImageName(previewImageName) }));
                image.alt = 'HWPX preview';
                image.style.display = 'block';
                image.style.maxWidth = '100%';
                image.style.height = 'auto';
                image.style.margin = '0 auto';
                image.style.background = '#fff';
                image.style.border = '1px solid #d7deea';
                image.style.borderRadius = '6px';
                image.style.boxShadow = '0 10px 28px rgba(15, 23, 42, 0.12)';
                wrapper.appendChild(image);
            }

            if (extracted) {
                const details = document.createElement('details');
                details.open = !previewImageName;
                const summary = document.createElement('summary');
                summary.textContent = '추출 텍스트';
                summary.style.cursor = 'pointer';
                summary.style.fontWeight = '700';
                summary.style.margin = '0 0 6px';
                const text = document.createElement('pre');
                text.className = 'markdown-source-code';
                text.textContent = extracted;
                details.appendChild(summary);
                details.appendChild(text);
                wrapper.appendChild(details);
            }

            if (!previewImageName && !extracted) {
                wrapper.textContent = '표시할 HWPX 프리뷰가 없습니다.';
            }
        } catch (error) {
            pane.innerHTML = '';
            createFallback(pane, fileUrl, 'hwpx', 'HWPX 문서를 브라우저에서 읽지 못했습니다. 파일 형식 또는 압축 방식을 확인하세요.');
        }
    }

    function getFileExtension(name) {
        const match = String(name || '').match(/\.([^.\/]+)$/);
        return match ? match[1].toLowerCase() : '';
    }

    function formatBytes(bytes) {
        const value = Number(bytes || 0);
        if (!value) {
            return '0 B';
        }
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = value;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex += 1;
        }
        return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
    }

    function isProbablyText(bytes) {
        const sample = bytes.slice(0, Math.min(bytes.length, 2048));
        if (sample.some(byte => byte === 0)) {
            return false;
        }
        return true;
    }

    async function renderArchiveEntryPreview(preview, entry) {
        preview.innerHTML = '';
        if (!entry || entry.isDirectory) {
            preview.textContent = '프리뷰할 파일을 선택하세요.';
            return;
        }

        const entryName = entry.fileName || '';
        const ext = getFileExtension(entryName);
        try {
            const bytes = await entry();
            if (archivePreviewImageExtensions.has(ext)) {
                const blob = new Blob([bytes]);
                const image = document.createElement('img');
                image.src = URL.createObjectURL(blob);
                image.alt = entryName;
                image.style.maxWidth = '100%';
                image.style.maxHeight = '100%';
                image.style.objectFit = 'contain';
                preview.appendChild(image);
                return;
            }

            if (archivePreviewPdfExtensions.has(ext)) {
                const iframe = document.createElement('iframe');
                iframe.title = entryName;
                iframe.src = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.minHeight = '420px';
                iframe.style.border = '0';
                preview.appendChild(iframe);
                return;
            }

            if (archivePreviewTextExtensions.has(ext) || isProbablyText(bytes)) {
                const text = new TextDecoder('utf-8').decode(bytes);
                const source = document.createElement('pre');
                source.className = 'markdown-source-code';
                if (window.SourceViewer && ext) {
                    window.SourceViewer.render(source, text, ext);
                } else {
                    source.textContent = text;
                }
                preview.appendChild(source);
                return;
            }

            createFallback(preview, '#', ext || 'file', '이 ZIP 내부 파일은 브라우저에서 바로 미리보기할 수 없습니다.');
        } catch (error) {
            preview.textContent = 'ZIP 내부 파일을 읽지 못했습니다.';
        }
    }

    async function renderArchiveDocument(pane, fileUrl) {
        pane.classList.add('directory-viewer-pane--markdown');
        const shell = document.createElement('div');
        shell.className = 'archive-viewer';
        shell.style.display = 'grid';
        shell.style.gridTemplateColumns = 'minmax(180px, 280px) minmax(0, 1fr)';
        shell.style.width = '100%';
        shell.style.height = '100%';
        shell.style.minHeight = '0';
        shell.style.overflow = 'hidden';
        const applyArchiveLayout = () => {
            if (window.matchMedia && window.matchMedia('(max-width: 720px)').matches) {
                shell.style.gridTemplateColumns = '1fr';
                shell.style.gridTemplateRows = 'minmax(120px, 34%) minmax(0, 1fr)';
            } else {
                shell.style.gridTemplateColumns = 'minmax(180px, 280px) minmax(0, 1fr)';
                shell.style.gridTemplateRows = '1fr';
            }
        };
        applyArchiveLayout();
        window.addEventListener('resize', applyArchiveLayout);

        const list = document.createElement('div');
        list.className = 'archive-viewer-list';
        list.style.overflow = 'auto';
        list.style.borderRight = '1px solid #d8dee9';
        list.style.background = '#f8fafc';
        list.style.padding = '6px';

        const preview = document.createElement('div');
        preview.className = 'archive-viewer-preview';
        preview.style.overflow = 'auto';
        preview.style.minWidth = '0';
        preview.style.padding = '8px';
        preview.textContent = 'ZIP 파일을 불러오는 중입니다.';

        shell.appendChild(list);
        shell.appendChild(preview);
        pane.appendChild(shell);

        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const entries = Array.from((await readZipEntries(await response.arrayBuffer())).values())
                .filter(entry => !entry.isDirectory)
                .sort((a, b) => String(a.fileName || '').localeCompare(String(b.fileName || ''), 'ko'));

            list.innerHTML = '';
            if (!entries.length) {
                preview.textContent = 'ZIP 내부에 표시할 파일이 없습니다.';
                return;
            }

            entries.forEach((entry, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'archive-viewer-entry';
                button.style.display = 'grid';
                button.style.gridTemplateColumns = 'minmax(0, 1fr)';
                button.style.width = '100%';
                button.style.padding = '7px 8px';
                button.style.margin = '0 0 4px';
                button.style.border = '1px solid #d8dee9';
                button.style.borderRadius = '7px';
                button.style.background = index === 0 ? '#e8f1ff' : '#fff';
                button.style.color = '#111827';
                button.style.textAlign = 'left';
                button.style.cursor = 'pointer';
                const nameLabel = document.createElement('strong');
                nameLabel.style.overflowWrap = 'anywhere';
                nameLabel.textContent = entry.fileName || '';
                const sizeLabel = document.createElement('span');
                sizeLabel.style.fontSize = '11px';
                sizeLabel.style.color = '#64748b';
                sizeLabel.textContent = formatBytes(entry.uncompressedSize);
                button.appendChild(nameLabel);
                button.appendChild(sizeLabel);
                button.addEventListener('click', () => {
                    list.querySelectorAll('.archive-viewer-entry').forEach(node => {
                        node.style.background = '#fff';
                    });
                    button.style.background = '#e8f1ff';
                    renderArchiveEntryPreview(preview, entry);
                });
                list.appendChild(button);
            });
            renderArchiveEntryPreview(preview, entries[0]);
        } catch (error) {
            pane.innerHTML = '';
            createFallback(pane, fileUrl, 'zip', 'ZIP 파일을 브라우저에서 읽지 못했습니다.');
        }
    }

    function normalizeText(text) {
        return String(text || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function renderZipTextDocument(pane, fileUrl, fileExt) {
        const viewer = createTextViewer(pane);
        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const entries = await readZipEntries(await response.arrayBuffer());
            const extracted = fileExt === 'pptx'
                ? await extractPptx(entries)
                : await extractHwpx(entries);
            viewer.textContent = normalizeText(extracted) || '추출된 텍스트가 없습니다.';
        } catch (error) {
            viewer.textContent = '문서를 브라우저에서 읽지 못했습니다. 파일 형식 또는 압축 방식을 확인하세요.';
        }
    }

    function render(pane, fileUrl, fileExt, fileName, meta) {
        const normalizedExt = String(fileExt || '').toLowerCase();
        const previewPath = previewTextPathFromMeta(meta);

        // 툴바 이벤트를 위해 pane 구조 설정
        pane.style.position = 'relative';
        pane.style.display = 'flex';
        pane.style.flexDirection = 'column';
        pane.style.overflow = 'hidden'; // pane 레벨에서 스크롤 방지
        pane.style.backgroundColor = '#fff'; // 전체화면시 배경색

        // 뷰어 툴바 생성
        const toolbar = document.createElement('div');
        toolbar.className = 'document-viewer-toolbar';
        toolbar.style.display = 'flex';
        toolbar.style.flexWrap = 'wrap';
        toolbar.style.gap = '3px';
        toolbar.style.padding = '3px';
        toolbar.style.background = '#f1f5f9';
        toolbar.style.borderBottom = '1px solid #e2e8f0';
        toolbar.style.justifyContent = 'flex-end';
        toolbar.style.zIndex = '10';

        const btnZoomIn = document.createElement('button');
        btnZoomIn.className = 'document-viewer-zoom-button';
        btnZoomIn.innerHTML = documentViewerIcons.zoomIn;
        btnZoomIn.title = '확대';
        btnZoomIn.setAttribute('aria-label', '확대');
        const btnZoomOut = document.createElement('button');
        btnZoomOut.className = 'document-viewer-zoom-button';
        btnZoomOut.innerHTML = documentViewerIcons.zoomOut;
        btnZoomOut.title = '축소';
        btnZoomOut.setAttribute('aria-label', '축소');
        const btnResetZoom = document.createElement('button');
        btnResetZoom.className = 'document-viewer-zoom-button';
        btnResetZoom.innerHTML = documentViewerIcons.reset;
        btnResetZoom.title = '원래대로';
        btnResetZoom.setAttribute('aria-label', '원래대로');
        [btnZoomIn, btnZoomOut, btnResetZoom].forEach(btn => {
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.width = '28px';
            btn.style.height = '28px';
            btn.style.padding = '0';
            btn.style.cursor = 'pointer';
            btn.style.border = '1px solid #cbd5e1';
            btn.style.background = '#fff';
            btn.style.borderRadius = '7px';
            btn.style.fontSize = '11px';
            btn.style.whiteSpace = 'nowrap';
            toolbar.appendChild(btn);
        }); // SOFTM-compact-viewer-toolbar 2026-05-16: 확대/축소/원래대로를 아이콘 버튼으로 줄여 문서 표시 영역 확보

        // 컨텐츠 컨테이너
        const contentContainer = document.createElement('div');
        contentContainer.style.flex = '1';
        contentContainer.style.width = '100%';
        contentContainer.style.position = 'relative';
        contentContainer.style.overflow = 'auto'; // 전체 컨테이너 스크롤

        // 줌 래퍼 생성
        const zoomWrapper = document.createElement('div');
        zoomWrapper.style.transformOrigin = 'top left';
        zoomWrapper.style.transition = 'transform 0.2s';
        zoomWrapper.style.width = '100%';
        zoomWrapper.style.height = '100%';
        zoomWrapper.style.overflow = 'auto'; // 내부 컨텐츠 스크롤 허용
        contentContainer.appendChild(zoomWrapper);

        let currentZoom = 1;
        btnZoomIn.onclick = () => { 
            currentZoom += 0.2; 
            zoomWrapper.style.transform = `scale(${currentZoom})`; 
            zoomWrapper.style.width = `${100 / currentZoom}%`;
            zoomWrapper.style.height = `${100 / currentZoom}%`;
        };
        btnZoomOut.onclick = () => { 
            currentZoom = Math.max(0.2, currentZoom - 0.2); 
            zoomWrapper.style.transform = `scale(${currentZoom})`; 
            zoomWrapper.style.width = `${100 / currentZoom}%`;
            zoomWrapper.style.height = `${100 / currentZoom}%`;
        };
        btnResetZoom.onclick = () => { 
            currentZoom = 1; 
            zoomWrapper.style.transform = `scale(${currentZoom})`; 
            zoomWrapper.style.width = '100%';
            zoomWrapper.style.height = '100%';
        };

        pane.appendChild(toolbar);
        pane.appendChild(contentContainer);

        let rendered = false;
        if (inlinePdfExtensions.has(normalizedExt)) {
            renderInlineFrame(zoomWrapper, fileUrl, 'PDF document viewer');
            rendered = true; // SOFTM-pdf-inline-viewer 2026-05-15: HWP 대체 PDF와 일반 PDF를 공통 뷰어 안에서 직접 표시
        } else if (officeDocumentExtensions.has(normalizedExt) && !isLocalPage()) {
            rendered = renderOfficeDocument(zoomWrapper, fileUrl, normalizedExt);
        } else if (normalizedExt === 'pptx') {
            renderPptx(zoomWrapper, fileUrl);
            rendered = true;
        } else if (hwpHtmlExtensions.has(normalizedExt)) {
            renderHwp(zoomWrapper, fileUrl);
            rendered = true;
        } else if (hwpxDocumentExtensions.has(normalizedExt)) {
            renderHwpxDocument(zoomWrapper, fileUrl);
            rendered = true;
        } else if (zipTextExtensions.has(normalizedExt)) {
            renderZipTextDocument(zoomWrapper, fileUrl, normalizedExt);
            rendered = true;
        } else if (previewPath && normalizedExt === 'hwp') {
            renderTextPreview(zoomWrapper, previewPath);
            rendered = true;
        } else if (officeDocumentExtensions.has(normalizedExt)) {
            rendered = renderOfficeDocument(zoomWrapper, fileUrl, normalizedExt);
        } else if (archiveExtensions.has(normalizedExt)) {
            renderArchiveDocument(zoomWrapper, fileUrl);
            rendered = true;
        }

        if (!rendered) {
            pane.innerHTML = '';
            return false;
        }
        return true;
    }

    window.DocumentViewer = { render, createFullscreenButton };
})(window, document);
