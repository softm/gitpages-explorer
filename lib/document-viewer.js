(function (window, document) {
    const officeDocumentExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
    const zipTextExtensions = new Set(['hwpx']);
    const hwpHtmlExtensions = new Set(['hwp']);
    const HWPJS_CDN_URL = 'https://esm.sh/@ohah/hwpjs?bundle';
    const EMU_PER_INCH = 914400;
    const DEFAULT_SLIDE_WIDTH = 12192000;
    const DEFAULT_SLIDE_HEIGHT = 6858000;
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
        button.textContent = settings.enterText || '전체화면';
        button.title = settings.enterTitle || '전체화면으로 보기';
        button.setAttribute('aria-pressed', 'false');

        const getTarget = typeof target === 'function' ? target : () => target;
        let lastActive = null;
        const update = () => {
            const element = getTarget();
            const active = Boolean(element && (getFullscreenElement() === element || element.classList.contains('is-pseudo-fullscreen')));
            button.textContent = active ? (settings.exitText || '나가기') : (settings.enterText || '전체화면');
            button.title = active ? (settings.exitTitle || '전체화면 나가기') : (settings.enterTitle || '전체화면으로 보기');
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

    function stripExtension(name) {
        return String(name || '').replace(/\.[^.\/]+$/i, '');
    }

    function tokenizeFileName(name) {
        return stripExtension(name)
            .normalize('NFKC')
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(token => token.length >= 2);
    }

    function getDirectoryPath(path) {
        const parts = String(path || '').split('/');
        parts.pop();
        return parts.join('/');
    }

    function flattenManifestFiles(node, files) {
        if (!node) {
            return files;
        }
        if (node.type === 'file') {
            files.push(node);
            return files;
        }
        (node.children || []).forEach(child => flattenManifestFiles(child, files));
        return files;
    }

    function buildFileUrlFromManifestPath(path) {
        return encodePath(path);
    }

    function scoreCompanionPdf(source, candidate) {
        const sourceName = source.name || source.path || '';
        const candidateName = candidate.name || candidate.path || '';
        const sourceBase = stripExtension(sourceName).normalize('NFKC').toLowerCase();
        const candidateBase = stripExtension(candidateName).normalize('NFKC').toLowerCase();
        if (sourceBase === candidateBase) {
            return 2;
        }

        const sourceTokens = new Set(tokenizeFileName(sourceName));
        const candidateTokens = tokenizeFileName(candidateName);
        if (!sourceTokens.size || !candidateTokens.length) {
            return 0;
        }

        const shared = candidateTokens.filter(token => sourceTokens.has(token)).length;
        const tokenScore = shared / candidateTokens.length;
        const sourceSize = Number(source.size || 0);
        const candidateSize = Number(candidate.size || 0);
        const sizeScore = sourceSize && candidateSize
            ? Math.min(sourceSize, candidateSize) / Math.max(sourceSize, candidateSize)
            : 0;

        if (tokenScore >= 0.75 && sizeScore >= 0.65) {
            return tokenScore + sizeScore;
        }
        return 0;
    }

    async function findCompanionPdf(meta) {
        if (!meta || !meta.path) {
            return '';
        }

        const directoryPath = getDirectoryPath(meta.path);
        if (!directoryPath) {
            return '';
        }

        try {
            const response = await fetch(encodePath(`${directoryPath}/files.json`));
            if (!response.ok) {
                return '';
            }
            const manifest = await response.json();
            const files = flattenManifestFiles(manifest.tree, []);
            const candidates = files
                .filter(file => String(file.extension || '').toLowerCase() === 'pdf')
                .map(file => ({
                    file,
                    score: scoreCompanionPdf(meta, file)
                }))
                .filter(candidate => candidate.score > 0)
                .sort((a, b) => b.score - a.score);

            const best = candidates[0] && candidates[0].file;
            return best && best.path ? buildFileUrlFromManifestPath(best.path) : '';
        } catch (error) {
            return '';
        }
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

    async function renderHwp(pane, fileUrl, meta) {
        const status = createMessage(pane, 'HWP 뷰어를 불러오는 중입니다.');
        try {
            const companionPdfUrl = await findCompanionPdf(meta);
            if (companionPdfUrl) {
                pane.innerHTML = '';
                renderInlineFrame(pane, companionPdfUrl, 'PDF document viewer');
                return;
            }

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

    async function readZipEntries(buffer) {
        const view = new DataView(buffer);
        const decoder = new TextDecoder('utf-8');
        const eocdOffset = findEndOfCentralDirectory(view);
        const entryCount = readUint16(view, eocdOffset + 10);
        let centralOffset = readUint32(view, eocdOffset + 16);
        const entries = new Map();

        for (let index = 0; index < entryCount; index += 1) {
            if (readUint32(view, centralOffset) !== 0x02014b50) {
                throw new Error('Invalid ZIP central directory');
            }

            const method = readUint16(view, centralOffset + 10);
            const compressedSize = readUint32(view, centralOffset + 20);
            const fileNameLength = readUint16(view, centralOffset + 28);
            const extraLength = readUint16(view, centralOffset + 30);
            const commentLength = readUint16(view, centralOffset + 32);
            const localOffset = readUint32(view, centralOffset + 42);
            const fileNameBytes = new Uint8Array(buffer, centralOffset + 46, fileNameLength);
            const fileName = decoder.decode(fileNameBytes);

            if (readUint32(view, localOffset) !== 0x04034b50) {
                throw new Error('Invalid ZIP local header');
            }

            const localNameLength = readUint16(view, localOffset + 26);
            const localExtraLength = readUint16(view, localOffset + 28);
            const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
            const compressed = new Uint8Array(buffer, dataOffset, compressedSize);

            entries.set(fileName, async () => {
                if (method === 0) {
                    return compressed;
                }
                if (method === 8) {
                    return inflateRaw(compressed);
                }
                throw new Error(`Unsupported ZIP compression method: ${method}`);
            });

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
        const names = Array.from(entries.keys())
            .filter(name => /\.xml$/i.test(name) && /^(contents|content)\//i.test(name))
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
        toolbar.style.display = 'flex';
        toolbar.style.flexWrap = 'wrap';
        toolbar.style.gap = '4px';
        toolbar.style.padding = '5px';
        toolbar.style.background = '#f1f5f9';
        toolbar.style.borderBottom = '1px solid #e2e8f0';
        toolbar.style.justifyContent = 'flex-end';
        toolbar.style.zIndex = '10';

        const btnZoomIn = document.createElement('button');
        btnZoomIn.textContent = '확대';
        const btnZoomOut = document.createElement('button');
        btnZoomOut.textContent = '축소';
        const btnResetZoom = document.createElement('button');
        btnResetZoom.textContent = '원래대로';
        [btnZoomIn, btnZoomOut, btnResetZoom].forEach(btn => {
            btn.style.padding = '3px 7px';
            btn.style.cursor = 'pointer';
            btn.style.border = '1px solid #cbd5e1';
            btn.style.background = '#fff';
            btn.style.borderRadius = '4px';
            btn.style.fontSize = '11px';
            btn.style.whiteSpace = 'nowrap';
            toolbar.appendChild(btn);
        });

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
        if (officeDocumentExtensions.has(normalizedExt) && !isLocalPage()) {
            rendered = renderOfficeDocument(zoomWrapper, fileUrl, normalizedExt);
        } else if (normalizedExt === 'pptx') {
            renderPptx(zoomWrapper, fileUrl);
            rendered = true;
        } else if (hwpHtmlExtensions.has(normalizedExt)) {
            renderHwp(zoomWrapper, fileUrl, meta);
            rendered = true;
        } else if (previewPath && (normalizedExt === 'hwp' || normalizedExt === 'hwpx')) {
            renderTextPreview(zoomWrapper, previewPath);
            rendered = true;
        } else if (officeDocumentExtensions.has(normalizedExt)) {
            rendered = renderOfficeDocument(zoomWrapper, fileUrl, normalizedExt);
        } else if (zipTextExtensions.has(normalizedExt)) {
            renderZipTextDocument(zoomWrapper, fileUrl, normalizedExt);
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
