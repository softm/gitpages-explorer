;(function (window, document) {
    const { buildAttachmentUrl, setupLazyImage, getFolderSortOrder } = window.AttachmentUtils;
    const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']);
    const videoExtensions = new Set(['mp4', 'mov', 'webm', 'ogv', 'mkv', 'avi', 'flv', 'wmv']);
    const audioExtensions = new Set(['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', '3gp', 'wma']);
    const documentExtensions = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'hwp', 'hwpx', 'zip']);
    const officeDocumentExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
    const inlineDocumentExtensions = new Set(['pdf', 'txt', 'csv', 'md']);
    const folderIconSvg = '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M5 13h20l5 6h29v21a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#56b9e8"/><path d="M5 10a5 5 0 0 1 5-5h15l5 6h24a5 5 0 0 1 5 5v5H5z" fill="#83d5f5"/><path d="M5 20h54v20a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#4aaee3"/></svg>';
    const dataroomViewerActionIcons = {
        previous: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1.3" fill="currentColor"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor"/></svg>',
        download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 17v3h14v-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };

    const folderSortOrder = typeof getFolderSortOrder === 'function' ? getFolderSortOrder() : [];
    const folderPriorityMap = new Map();
    folderSortOrder.forEach((folderName, index) => {
        folderPriorityMap.set(toComparable(folderName), index);
    });
    const DEFAULT_FOLDER_PRIORITY = folderSortOrder.length;

    const filterTypes = ['image', 'video', 'audio', 'document'];
    const filterExtensionSets = {
        image: imageExtensions,
        video: videoExtensions,
        audio: audioExtensions,
        document: documentExtensions
    };

    function createFileBadge(type, ext) {
        const badge = document.createElement('span');
        badge.className = 'file-badge';
        badge.dataset.type = type || 'other';
        if (type === 'document' && ext) {
            badge.textContent = ext.toUpperCase();
        } else if (type === 'audio') {
            badge.textContent = 'AUD';
        } else if (type === 'video') {
            badge.textContent = 'VID';
        } else if (ext) {
            badge.textContent = ext.toUpperCase();
        } else {
            badge.textContent = '?';
        }
        return badge;
    }

    function basename(path) {
        const value = String(path || '');
        const parts = value.split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : value || '.';
    }

    function getDirectoryNote(path) {
        return directoryNoteMap.get(String(path || '.')) || null;
    }

    function createMiniIcon(item) {
        const icon = document.createElement('span');
        icon.className = 'dataroom-mini-icon';

        if (item && item.kind === 'directory') {
            icon.classList.add('dataroom-mini-folder');
            icon.innerHTML = folderIconSvg;
            return icon;
        }

        const filename = item && item.filename ? item.filename : '';
        const fileExt = (filename.split('.').pop() || '').toLowerCase();
        const type = getAttachmentType(fileExt);
        const fileUrl = getAttachmentUrl(item);

        if (type === 'image' && fileUrl) {
            const img = document.createElement('img');
            img.alt = '';
            setupLazyImage(img, fileUrl);
            icon.appendChild(img);
            return icon;
        }

        icon.dataset.type = type;
        icon.textContent = fileExt ? fileExt.toUpperCase() : '?';
        return icon;
    }

    let items = [];
    let directoryNotes = [];
    const directoryNoteMap = new Map();
    let currentHighlightKeywords = [];
    let currentSearchScope = 'all';
    let currentResults = [];
    let currentViewerIndex = -1;
    const scrollContainers = [];

    let modal, modalTitle, modalBody, closeModalBtn, modalPrevBtn, modalNextBtn, modalMeta;
    let runSearchRef = null;
    let selectedListKey = '';
    let selectedListKeys = new Set(); // SOFTM-dataroom-multi-select 2026-05-17: 자료실 멀티 선택 키 집합 상태 추가
    let selectionAnchorKey = ''; // SOFTM-dataroom-multi-select 2026-05-17: Shift 범위 선택 기준 키 추가
    let loadedTypeFilterValue = 'all';
    let currentDirectoryChain = [];
    let modalReturnFocusElement = null;
    let currentAttachmentFilters = createEmptyAttachmentFilterState();
    let isRestoringHistory = false;
    let historyDebounceTimer = null;
    const HISTORY_DEBOUNCE_MS = 650;

    function getSearchStateParams(viewerItem) {
        const params = new URLSearchParams();
        const searchInput = document.getElementById('searchInput');
        const searchValue = searchInput && searchInput.value ? searchInput.value.trim() : '';
        const scope = getSearchScope();

        if (searchValue) {
            params.set('search', searchValue);
        }
        params.set('scope', scope);
        params.set('titleOnly', scope === 'title' ? '1' : '0');

        filterTypes.forEach(type => {
            const checkbox = document.getElementById(`${type}Filter`);
            if (!checkbox) {
                return;
            }
            params.set(type, checkbox.checked ? '1' : '0');
            if (checkbox.checked) {
                const selected = getSelectedExtensions(type);
                if (selected.length > 0) {
                    params.set(`${type}_ext`, selected.join(','));
                }
            }
        });

        if (loadedTypeFilterValue && loadedTypeFilterValue !== 'all') {
            params.set('loadedFilter', loadedTypeFilterValue);
        }
        if (selectedListKey) {
            params.set('selected', selectedListKey);
        }
        if (currentDirectoryChain.length > 1) {
            params.set('chain', currentDirectoryChain.join('\n'));
        }
        if (viewerItem && viewerItem.key) {
            params.set('viewer', viewerItem.key);
        }

        return params;
    }

    function getCurrentStateUrl(viewerItem) {
        const params = getSearchStateParams(viewerItem);
        const query = params.toString();
        return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
    }

    function recordHistory(action, options = {}) {
        if (isRestoringHistory) {
            return;
        }
        if (historyDebounceTimer) {
            clearTimeout(historyDebounceTimer);
            historyDebounceTimer = null;
        }
        const viewerItem = Number.isInteger(currentViewerIndex) && currentViewerIndex >= 0
            ? currentResults[currentViewerIndex]
            : null;
        const url = getCurrentStateUrl(options.includeViewer ? viewerItem : null);
        const state = { page: 'dataroom', action: action || 'state' };
        if (options.replace) {
            window.history.replaceState(state, '', url);
        } else if (window.location.pathname + window.location.search + window.location.hash !== url) {
            window.history.pushState(state, '', url);
        }
    }

    function scheduleHistoryRecord(action) {
        if (isRestoringHistory) {
            return;
        }
        if (historyDebounceTimer) {
            clearTimeout(historyDebounceTimer);
        }
        historyDebounceTimer = setTimeout(() => {
            historyDebounceTimer = null;
            recordHistory(action || 'search');
        }, HISTORY_DEBOUNCE_MS);
    }

    /* SOFTM-dataroom-mobile-sheet 2026-05-16: 자료실 모바일 파일 뷰어를 메인과 같은 하단 시트 모달로 표시하기 위한 뷰포트 판단 시작 */
    function isMobileViewerSheetViewport() {
        return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    }
    /* SOFTM-dataroom-mobile-sheet-END */

    function openModal() {
        modalReturnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (modal) {
            /* SOFTM-dataroom-mobile-sheet 2026-05-16: 파일 뷰어 모달 표시 시 모바일 하단 시트 클래스를 동기화 시작 */
            const useMobileViewerSheet = isMobileViewerSheetViewport()
                && Boolean(modalBody && modalBody.querySelector('.directory-viewer'));
            modal.classList.toggle('modal--mobile-viewer-sheet', useMobileViewerSheet);
            document.body.classList.toggle('modal-viewer-sheet-open', useMobileViewerSheet);
            /* SOFTM-dataroom-mobile-sheet-END */
            modal.style.display = 'block';
        }
    }

    function closeModal(options = {}) {
        const wasOpen = modal && modal.style.display === 'block';
        if (modal) {
            modal.style.display = 'none';
            /* SOFTM-dataroom-mobile-sheet 2026-05-16: 모달 닫을 때 모바일 하단 시트 상태를 함께 정리 시작 */
            modal.classList.remove('modal--mobile-viewer-sheet');
        }
        document.body.classList.remove('modal-viewer-sheet-open');
        /* SOFTM-dataroom-mobile-sheet-END */
        if (modalBody) modalBody.innerHTML = ''; // Clear content
        currentViewerIndex = -1;
        if (modalMeta) {
            modalMeta.textContent = '';
        }
        updateModalNavigationState();
        if (wasOpen && !options.silent) {
            recordHistory('close-viewer');
        }
        requestAnimationFrame(() => {
            const selectedNode = selectedListKey
                ? document.querySelector(`#file-list li[data-key="${CSS.escape(selectedListKey)}"]`)
                : null;
            if (selectedNode) {
                selectedNode.focus({ preventScroll: true });
                return;
            }
            if (modalReturnFocusElement && document.body.contains(modalReturnFocusElement)) {
                modalReturnFocusElement.focus({ preventScroll: true });
            }
        });
    }

    function getAudioMimeType(ext) {
        switch (ext) {
            case 'mp3':
                return 'audio/mpeg';
            case 'm4a':
                return 'audio/mp4';
            case 'aac':
                return 'audio/aac';
            case 'ogg':
                return 'audio/ogg';
            case 'wav':
                return 'audio/wav';
            case 'flac':
                return 'audio/flac';
            case '3gp':
                return 'audio/3gpp';
            case 'wma':
                return 'audio/x-ms-wma';
            default:
                return ext ? `audio/${ext}` : '';
        }
    }

    function canPlayMimeType(mimeType) {
        if (!mimeType) {
            return false;
        }
        const probe = document.createElement('audio');
        if (!probe || typeof probe.canPlayType !== 'function') {
            return false;
        }
        const result = probe.canPlayType(mimeType);
        return typeof result === 'string' && result.length > 0;
    }

    function isEditableShortcutTarget(target) {
        return Boolean(target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]'));
    }

    function isMacPlatform() {
        return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    }

    function openSelectedDataRoomViewer() {
        const index = currentResults.findIndex(item => item && item.key === selectedListKey);
        if (index < 0) {
            return false;
        }
        const item = currentResults[index];
        if (!item) {
            return false;
        }
        if (item.kind === 'file') {
            openAttachmentViewerAt(index);
            return true;
        }
        selectDataRoomItem(item, index);
        return true;
    }

    function focusSearchInput() {
        const input = document.getElementById('searchInput');
        if (!input) {
            return false;
        }
        input.focus();
        input.select();
        return true;
    }

    function focusLoadedFilter() {
        const filter = document.getElementById('loadedTypeFilter');
        if (!filter) {
            return false;
        }
        filter.focus();
        return true;
    }

    function setupHistoryKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            const editableTarget = isEditableShortcutTarget(event.target);
            const isMac = isMacPlatform();
            const openViewerShortcut = (isMac && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === 'ArrowDown')
                || (!isMac && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === 'Enter');
            if (!editableTarget && openViewerShortcut) {
                if (openSelectedDataRoomViewer()) {
                    event.preventDefault();
                }
                return;
            }

            const searchShortcut = (event.metaKey || event.ctrlKey)
                && !event.altKey
                && !event.shiftKey
                && String(event.key || '').toLowerCase() === 'f';
            if (searchShortcut) {
                if (focusSearchInput()) {
                    event.preventDefault();
                }
                return;
            }

            if (!editableTarget && event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
                if (focusSearchInput()) {
                    event.preventDefault();
                }
                return;
            }

            if (!editableTarget && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'e') {
                if (focusLoadedFilter()) {
                    event.preventDefault();
                }
                return;
            }

            if (editableTarget) {
                return;
            }
            const hasHistoryModifier = event.metaKey || event.ctrlKey;
            if (!hasHistoryModifier || event.altKey || event.shiftKey) {
                return;
            }
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                window.history.back();
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                window.history.forward();
            }
        });
    }

    function getAttachmentType(fileExt) {
        const normalized = (fileExt || '').toLowerCase();
        if (imageExtensions.has(normalized)) {
            return 'image';
        }
        if (videoExtensions.has(normalized)) {
            return 'video';
        }
        if (audioExtensions.has(normalized)) {
            return 'audio';
        }
        if (documentExtensions.has(normalized)) {
            return 'document';
        }
        return 'other';
    }

    function updateModalNavigationState() {
        const total = Array.isArray(currentResults) ? currentResults.length : 0;
        const hasSelection = Number.isInteger(currentViewerIndex)
            && currentViewerIndex >= 0
            && currentViewerIndex < total;

        if (modalPrevBtn) {
            modalPrevBtn.disabled = !hasSelection || currentViewerIndex <= 0;
        }
        if (modalNextBtn) {
            modalNextBtn.disabled = !hasSelection || currentViewerIndex >= total - 1;
        }
        if (modalMeta) {
            modalMeta.textContent = hasSelection ? `${currentViewerIndex + 1} / ${total}` : '';
        }
    }

    function navigateAttachment(step) {
        if (!Array.isArray(currentResults) || currentResults.length === 0) {
            return;
        }
        const targetIndex = currentViewerIndex + step;
        if (targetIndex < 0 || targetIndex >= currentResults.length) {
            return;
        }
        openAttachmentViewerAt(targetIndex);
    }

    function openAttachmentViewerAt(index, options = {}) {
        if (!Array.isArray(currentResults) || index < 0 || index >= currentResults.length) {
            return;
        }
        if (currentResults[index] && currentResults[index].kind === 'directory') {
            selectDataRoomItem(currentResults[index], index);
            return;
        }
        currentViewerIndex = index;
        renderAttachmentViewer(index, { pushHistory: options.pushHistory !== false });
    }

    function getAttachmentUrl(item) {
        if (!item) {
            return '';
        }
        return buildAttachmentUrl({
            html_file: item.htmlFile,
            folder: item.folder,
            directory_path: item.directoryPath
        }, item.filename);
    }

    function getFileBaseName(name) {
        return String(name || '').replace(/\.[^.]+$/g, '');
    }

    function getComparableFileTokens(name) {
        return getFileBaseName(name)
            .toLowerCase()
            .split(/[^0-9a-z가-힣]+/i)
            .map(token => token.trim())
            .filter(token => token.length >= 2);
    }

    function normalizeComparableFileName(name) {
        return getComparableFileTokens(name).join('');
    }

    function scorePdfAlternateForHwp(hwpItem, pdfItem) {
        const hwpName = hwpItem && hwpItem.filename;
        const pdfName = pdfItem && pdfItem.filename;
        const hwpComparable = normalizeComparableFileName(hwpName);
        const pdfComparable = normalizeComparableFileName(pdfName);
        if (!hwpComparable || !pdfComparable) {
            return 0;
        }
        if (hwpComparable === pdfComparable || hwpComparable.includes(pdfComparable) || pdfComparable.includes(hwpComparable)) {
            return 100;
        }
        const hwpTokens = new Set(getComparableFileTokens(hwpName));
        const pdfTokens = getComparableFileTokens(pdfName);
        const overlap = pdfTokens.filter(token => hwpTokens.has(token));
        const hasPersonalSuffix = /_[^_]+$/.test(getFileBaseName(hwpName)) && overlap.some(token => getFileBaseName(hwpName).endsWith(token));
        return overlap.length + (hasPersonalSuffix ? 1 : 0);
    }

    function findRelatedPdfAttachmentForHwp(item) {
        const extension = String(item && (item.extension || (item.filename || '').split('.').pop()) || '').toLowerCase();
        if (extension !== 'hwp' && extension !== 'hwpx') {
            return null;
        }
        const note = getDirectoryNote(item.directoryPath);
        const files = note && Array.isArray(note.file_details) ? note.file_details : [];
        const candidates = files
            .map(file => fileItemFromDetail(note, file))
            .filter(candidate => String(candidate.extension || '').toLowerCase() === 'pdf');
        let best = null;
        let bestScore = 0;
        candidates.forEach(candidate => {
            const score = scorePdfAlternateForHwp(item, candidate);
            if (score > bestScore) {
                best = candidate;
                bestScore = score;
            }
        });
        return bestScore >= 4 ? best : null; // SOFTM-hwp-pdf-alternate 2026-05-15: 자료실에서도 깨지는 HWP는 같은 폴더의 유사 PDF를 우선 표시
    }

    function createAttachmentViewerThumb(item) {
        const fileUrl = getAttachmentUrl(item);
        const fileExt = (item.filename.split('.').pop() || '').toLowerCase();
        const type = getAttachmentType(fileExt);

        if (type === 'image') {
            const img = document.createElement('img');
            img.alt = item.filename || '';
            setupLazyImage(img, fileUrl);
            return img;
        }

        const badge = createFileBadge(type, fileExt);
        return badge;
    }

    function renderMarkdownSourceViewer(pane, fileUrl) {
        pane.classList.add('directory-viewer-pane--markdown');

        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-source-viewer';

        const toolbar = document.createElement('div');
        toolbar.className = 'markdown-source-toolbar';

        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.textContent = 'Preview';
        previewButton.setAttribute('aria-pressed', 'true');

        const sourceButton = document.createElement('button');
        sourceButton.type = 'button';
        sourceButton.textContent = '소스보기';
        sourceButton.setAttribute('aria-pressed', 'false');

        toolbar.appendChild(previewButton);
        toolbar.appendChild(sourceButton);

        const preview = document.createElement('article');
        preview.className = 'markdown-viewer markdown-source-preview';
        preview.textContent = '문서를 불러오는 중입니다.';

        const source = document.createElement('pre');
        source.className = 'markdown-source-code';
        source.hidden = true;
        let sourceText = '';
        if (window.SourceViewer) {
            window.SourceViewer.addToolbarControls(toolbar, source, () => sourceText);
        }

        const setMode = (mode) => {
            const isPreview = mode === 'preview';
            preview.hidden = !isPreview;
            source.hidden = isPreview;
            previewButton.setAttribute('aria-pressed', isPreview ? 'true' : 'false');
            sourceButton.setAttribute('aria-pressed', isPreview ? 'false' : 'true');
        };

        previewButton.addEventListener('click', () => setMode('preview'));
        sourceButton.addEventListener('click', () => setMode('source'));

        wrapper.appendChild(toolbar);
        wrapper.appendChild(preview);
        wrapper.appendChild(source);
        pane.appendChild(wrapper);

        fetch(fileUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                sourceText = text;
                preview.innerHTML = markdownToHtml(text, fileUrl);
                if (window.SourceViewer) {
                    window.SourceViewer.render(source, text, 'md');
                } else {
                    source.textContent = text;
                }
            })
            .catch(() => {
                preview.textContent = 'Markdown 문서를 불러오지 못했습니다.';
                source.textContent = '';
            });
    }

    function renderAttachmentViewerPane(item) {
        const pane = document.createElement('div');
        pane.className = 'directory-viewer-pane';
        const fileExt = (item.filename.split('.').pop() || '').toLowerCase();
        const alternatePdfItem = findRelatedPdfAttachmentForHwp(item);
        const viewerItem = alternatePdfItem || item;
        const fileUrl = getAttachmentUrl(viewerItem);
        const viewerExt = String(viewerItem.extension || (viewerItem.filename || '').split('.').pop() || fileExt).toLowerCase();
        const type = getAttachmentType(fileExt);

        if (fileExt === 'html' || fileExt === 'htm') {
            renderHtmlSourceViewer(pane, fileUrl, item.filename || '');
            return pane;
        }

        if (fileExt === 'md') {
            renderMarkdownSourceViewer(pane, fileUrl);
            return pane;
        }

        if (window.DocumentViewer && window.DocumentViewer.render(pane, fileUrl, viewerExt, viewerItem.filename || item.filename || '', viewerItem)) {
            return pane;
        }

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.alt = item.filename || '';
            pane.appendChild(img);
            return pane;
        }

        if (type === 'video') {
            const video = document.createElement('video');
            video.src = fileUrl;
            video.controls = true;
            video.playsInline = true;
            pane.appendChild(video);
            return pane;
        }

        if (type === 'audio') {
            const audio = document.createElement('audio');
            const mimeType = getAudioMimeType(fileExt);
            audio.controls = true;
            if (mimeType && canPlayMimeType(mimeType)) {
                const source = document.createElement('source');
                source.src = fileUrl;
                source.type = mimeType;
                audio.appendChild(source);
            } else {
                audio.src = fileUrl;
            }
            pane.appendChild(audio);
            return pane;
        }

        if (type === 'document') {
            const viewerUrl = buildDocumentViewerUrl(fileUrl, fileExt);
            if (viewerUrl) {
                const iframe = document.createElement('iframe');
                iframe.src = viewerUrl;
                pane.appendChild(iframe);
                return pane;
            }
        }

        renderPlainSourceViewer(pane, fileUrl, fileExt, item.filename || '');
        return pane;
    }

    function isTextLikeContent(text) {
        if (!text) {
            return true;
        }
        const sample = String(text).slice(0, 2048);
        if (sample.includes('\u0000')) {
            return false;
        }
        const replacementCount = (sample.match(/\uFFFD/g) || []).length;
        return replacementCount <= Math.max(4, sample.length * 0.02);
    }

    function renderPlainSourceViewer(pane, fileUrl, fileExt, title) {
        pane.classList.add('directory-viewer-pane--markdown');

        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-source-viewer';

        const toolbar = document.createElement('div');
        toolbar.className = 'markdown-source-toolbar';

        const sourceButton = document.createElement('button');
        sourceButton.type = 'button';
        sourceButton.textContent = '내용보기';
        sourceButton.setAttribute('aria-pressed', 'true');
        sourceButton.disabled = true;

        const openLink = document.createElement('a');
        openLink.href = fileUrl;
        openLink.target = '_blank';
        openLink.rel = 'noopener';
        openLink.textContent = '새 창에서 열기';

        toolbar.appendChild(sourceButton);
        toolbar.appendChild(openLink);

        const source = document.createElement('pre');
        source.className = 'markdown-source-code';
        source.textContent = `${title || (fileExt ? `${fileExt.toUpperCase()} 파일` : '파일')}을 불러오는 중입니다.`;
        let sourceText = '';
        if (window.SourceViewer) {
            window.SourceViewer.addToolbarControls(toolbar, source, () => sourceText);
        }

        wrapper.appendChild(toolbar);
        wrapper.appendChild(source);
        pane.appendChild(wrapper);

        fetch(fileUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                if (isTextLikeContent(text)) {
                    sourceText = text;
                    if (window.SourceViewer) {
                        window.SourceViewer.render(source, text, fileExt);
                    } else {
                        source.textContent = text;
                    }
                } else {
                    sourceText = '';
                    source.textContent = '이 파일은 텍스트로 표시하기 어렵습니다. 새 창에서 열기를 사용하세요.';
                }
            })
            .catch(() => {
                source.textContent = '파일 내용을 불러오지 못했습니다. 새 창에서 열기를 사용하세요.';
            });
    }

    function renderHtmlSourceViewer(pane, fileUrl, title) {
        pane.classList.add('directory-viewer-pane--markdown');

        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-source-viewer html-source-viewer';

        const toolbar = document.createElement('div');
        toolbar.className = 'markdown-source-toolbar';

        const previewButton = document.createElement('button');
        previewButton.type = 'button';
        previewButton.textContent = 'Preview';
        previewButton.setAttribute('aria-pressed', 'true');

        const sourceButton = document.createElement('button');
        sourceButton.type = 'button';
        sourceButton.textContent = '소스보기';
        sourceButton.setAttribute('aria-pressed', 'false');

        toolbar.appendChild(previewButton);
        toolbar.appendChild(sourceButton);

        const preview = document.createElement('iframe');
        preview.className = 'html-source-preview';
        preview.title = title || 'HTML preview';
        preview.src = fileUrl;
        preview.loading = 'lazy';
        preview.sandbox = 'allow-same-origin allow-popups allow-forms';

        const source = document.createElement('pre');
        source.className = 'markdown-source-code';
        source.textContent = '소스를 불러오는 중입니다.';
        source.hidden = true;
        let sourceText = '';
        if (window.SourceViewer) {
            window.SourceViewer.addToolbarControls(toolbar, source, () => sourceText);
        }

        const setMode = (mode) => {
            const isPreview = mode === 'preview';
            preview.hidden = !isPreview;
            source.hidden = isPreview;
            previewButton.setAttribute('aria-pressed', isPreview ? 'true' : 'false');
            sourceButton.setAttribute('aria-pressed', isPreview ? 'false' : 'true');
        };

        previewButton.addEventListener('click', () => setMode('preview'));
        sourceButton.addEventListener('click', () => setMode('source'));

        wrapper.appendChild(toolbar);
        wrapper.appendChild(preview);
        wrapper.appendChild(source);
        pane.appendChild(wrapper);

        fetch(fileUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                sourceText = text;
                if (window.SourceViewer) {
                    window.SourceViewer.render(source, text, 'html');
                } else {
                    source.textContent = text;
                }
            })
            .catch(() => {
                source.textContent = 'HTML 소스를 불러오지 못했습니다.';
            });
    }

    function renderAttachmentViewer(startIndex, options = {}) {
        if (!modalBody || !modalTitle || !Array.isArray(currentResults) || currentResults.length === 0) {
            return;
        }
        const viewerItems = currentResults.filter(item => item && item.kind !== 'directory');
        if (!viewerItems.length) {
            return;
        }
        const requestedItem = currentResults[Math.max(0, Math.min(startIndex, currentResults.length - 1))];
        let selectedIndex = Math.max(0, viewerItems.findIndex(item => requestedItem && item.key === requestedItem.key));
        modalBody.innerHTML = '';
        modalBody.scrollTop = 0;

        const viewer = document.createElement('div');
        viewer.className = 'directory-viewer';
        viewer.tabIndex = 0;

        const main = document.createElement('div');
        main.className = 'directory-viewer-main';

        const nav = document.createElement('div');
        nav.className = 'directory-viewer-nav';

        const navSpacer = document.createElement('div');
        navSpacer.className = 'directory-viewer-nav-spacer';

        const navControls = document.createElement('div');
        navControls.className = 'directory-viewer-nav-controls';

        const navActions = document.createElement('div');
        navActions.className = 'directory-viewer-nav-actions';

        const prevButton = document.createElement('button');
        prevButton.type = 'button';
        prevButton.className = 'directory-viewer-icon-button';
        prevButton.innerHTML = dataroomViewerActionIcons.previous;
        prevButton.title = '이전';
        prevButton.setAttribute('aria-label', '이전');

        const nextButton = document.createElement('button');
        nextButton.type = 'button';
        nextButton.className = 'directory-viewer-icon-button';
        nextButton.innerHTML = dataroomViewerActionIcons.next;
        nextButton.title = '다음';
        nextButton.setAttribute('aria-label', '다음');

        const railToggleButton = document.createElement('button');
        railToggleButton.type = 'button';
        railToggleButton.className = 'directory-viewer-rail-toggle directory-viewer-icon-button';
        railToggleButton.innerHTML = dataroomViewerActionIcons.list;
        railToggleButton.title = '파일 목록';
        railToggleButton.setAttribute('aria-label', '파일 목록');
        railToggleButton.setAttribute('aria-expanded', 'false');

        const counter = document.createElement('span');
        counter.className = 'directory-viewer-counter';

        const fullscreenButton = window.DocumentViewer && window.DocumentViewer.createFullscreenButton
            ? window.DocumentViewer.createFullscreenButton(viewer)
            : null;
        const downloadButton = document.createElement('a');
        downloadButton.className = 'directory-viewer-download-button';
        downloadButton.setAttribute('aria-label', '다운로드');
        downloadButton.title = '다운로드';
        downloadButton.innerHTML = dataroomViewerActionIcons.download; // SOFTM-dataroom-viewer-download-icon 2026-05-16: 모바일 뷰어 시트에 다운로드 아이콘 액션 추가

        navControls.appendChild(prevButton);
        navControls.appendChild(counter);
        navControls.appendChild(nextButton);
        navActions.appendChild(railToggleButton);
        navActions.appendChild(downloadButton);
        if (fullscreenButton) {
            navActions.appendChild(fullscreenButton);
        }
        nav.appendChild(navControls);
        nav.appendChild(navSpacer);
        nav.appendChild(navActions);

        const content = document.createElement('div');
        content.className = 'directory-viewer-content';

        const rail = document.createElement('div');
        rail.className = 'directory-viewer-rail';

        const syncRailToggle = () => {
            const expanded = viewer.classList.contains('is-rail-open');
            railToggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            railToggleButton.title = expanded ? '파일 목록 닫기' : '파일 목록';
            railToggleButton.setAttribute('aria-label', expanded ? '파일 목록 닫기' : '파일 목록');
        };
        railToggleButton.addEventListener('click', () => {
            viewer.classList.toggle('is-rail-open');
            syncRailToggle();
        }); // SOFTM-dataroom-viewer-sheet-mainlike 2026-05-16: 메인 뷰어처럼 파일 목록 토글 제공
        if (isMobileViewerSheetViewport()) {
            viewer.classList.add('is-rail-open');
            syncRailToggle();
        }

        const render = (pushHistory) => {
            const item = viewerItems[selectedIndex];
            currentViewerIndex = currentResults.findIndex(candidate => candidate && candidate.key === item.key);
            modalTitle.textContent = item.filename || 'Viewer';
            counter.textContent = `${selectedIndex + 1} / ${viewerItems.length}`;
            prevButton.disabled = selectedIndex <= 0;
            nextButton.disabled = selectedIndex >= viewerItems.length - 1;
            downloadButton.href = getAttachmentUrl(item);
            downloadButton.download = item.filename || '';
            content.innerHTML = '';
            content.appendChild(renderAttachmentViewerPane(item));
            rail.querySelectorAll('.directory-viewer-thumb').forEach((thumb, index) => {
                thumb.classList.toggle('is-selected', index === selectedIndex);
                if (index === selectedIndex) {
                    thumb.scrollIntoView({ block: 'nearest' });
                }
            });
            updateModalNavigationState();
            if (pushHistory) {
                recordHistory('viewer', { includeViewer: true });
            }
        };

        viewerItems.forEach((item, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'directory-viewer-thumb';
            button.appendChild(createAttachmentViewerThumb(item));
            const label = document.createElement('span');
            label.textContent = item.filename || '';
            button.appendChild(label);
            button.addEventListener('click', () => {
                selectedIndex = index;
                render(true);
                button.focus({ preventScroll: true });
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    selectedIndex = Math.max(0, index - 1);
                    render(true);
                    const target = rail.querySelectorAll('.directory-viewer-thumb')[selectedIndex];
                    if (target) target.focus({ preventScroll: true });
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    selectedIndex = Math.min(viewerItems.length - 1, index + 1);
                    render(true);
                    const target = rail.querySelectorAll('.directory-viewer-thumb')[selectedIndex];
                    if (target) target.focus({ preventScroll: true });
                } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectedIndex = index;
                    render(true);
                }
            });
            rail.appendChild(button);
        });

        prevButton.addEventListener('click', () => {
            if (selectedIndex > 0) {
                selectedIndex -= 1;
                render(true);
            }
        });
        nextButton.addEventListener('click', () => {
            if (selectedIndex < viewerItems.length - 1) {
                selectedIndex += 1;
                render(true);
            }
        });
        viewer.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft' && selectedIndex > 0) {
                event.preventDefault();
                selectedIndex -= 1;
                render(true);
            }
            if (event.key === 'ArrowRight' && selectedIndex < viewerItems.length - 1) {
                event.preventDefault();
                selectedIndex += 1;
                render(true);
            }
        });

        main.appendChild(nav);
        main.appendChild(content);
        viewer.appendChild(main);
        viewer.appendChild(rail);
        modalBody.appendChild(viewer);
        render(Boolean(options.pushHistory));
        openModal();
        viewer.focus();
    }


    function createEmptyAttachmentFilterState() {
        const state = {};
        filterTypes.forEach(type => {
            state[type] = {
                enabled: false,
                extensions: new Set()
            };
        });
        return state;
    }

    function getExtensionContainer(filterType) {
        return document.getElementById(`${filterType}Extensions`);
    }

    function setupExtensionFilters() {
        filterTypes.forEach(type => {
            const container = getExtensionContainer(type);
            if (!container) {
                return;
            }
            container.innerHTML = '';
            const extensions = Array.from(filterExtensionSets[type] || []).sort();
            extensions.forEach(ext => {
                const label = document.createElement('label');
                label.className = 'extension-option';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = ext;
                checkbox.addEventListener('change', () => {
                    if (typeof runSearchRef === 'function') {
                        runSearchRef();
                    }
                });

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(ext.toUpperCase()));
                container.appendChild(label);
            });
        });
    }

    function getFolderPriority(folderName) {
        const key = toComparable(folderName || '');
        if (folderPriorityMap.has(key)) {
            return folderPriorityMap.get(key);
        }
        return DEFAULT_FOLDER_PRIORITY;
    }

    function getSelectedExtensions(filterType) {
        const container = getExtensionContainer(filterType);
        if (!container) {
            return [];
        }
        return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
            .map(input => (input.value || '').toLowerCase());
    }

    function updateExtensionVisibility(filterType, isEnabled, clearSelections) {
        const container = getExtensionContainer(filterType);
        if (!container) {
            return;
        }
        container.style.display = isEnabled ? 'flex' : 'none';
        if (!isEnabled && clearSelections) {
            Array.from(container.querySelectorAll('input[type="checkbox"]')).forEach(input => {
                input.checked = false;
            });
        }
    }

    function handleAttachmentFilterToggle(filterType) {
        const checkbox = document.getElementById(`${filterType}Filter`);
        if (!checkbox) {
            return;
        }
        const isEnabled = checkbox.checked;
        updateExtensionVisibility(filterType, isEnabled, !isEnabled);
        if (typeof runSearchRef === 'function') {
            runSearchRef();
        }
    }

    function matchesAttachmentFilter(fileExt, filters) {
        const activeFilters = Object.entries(filters || {}).filter(([, state]) => state && state.enabled);
        if (!activeFilters.length) {
            return true;
        }
        const normalizedExt = (fileExt || '').toLowerCase();
        return activeFilters.some(([type, state]) => {
            const baseExtensions = filterExtensionSets[type] || new Set();
            const selectedExtensions = state.extensions && state.extensions.size > 0 ? state.extensions : baseExtensions;
            return selectedExtensions.has(normalizedExt);
        });
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizeDisplayText(value) {
        return String(value || '').normalize('NFC');
    }

    function toComparable(value) {
        return (value || '').normalize('NFKC').toLowerCase();
    }

    function normalizeForSearch(value) {
        return toComparable(value).trim();
    }

    function removeSpaces(value) {
        return value.replace(/\s+/g, '');
    }

    function removeSpacesAndParens(value) {
        return value.replace(/\s+/g, '').replace(/[()]/g, '');
    }

    function buildAbsoluteUrl(url) {
        try {
            return new URL(url, window.location.href).href;
        } catch (error) {
            return url;
        }
    }

    function encodeOfficeViewerSource(url) {
        return encodeURIComponent(url).replace(/[!'()*]/g, (char) => (
            `%${char.charCodeAt(0).toString(16).toUpperCase()}`
        ));
    }

    function isPublicViewerUrl(url) {
        try {
            const parsed = new URL(url, window.location.href);
            return /^https?:$/.test(parsed.protocol)
                && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
        } catch (error) {
            return false;
        }
    }

    function buildDocumentViewerUrl(fileUrl, fileExt) {
        const normalizedExt = (fileExt || '').toLowerCase();
        if (inlineDocumentExtensions.has(normalizedExt)) {
            return fileUrl;
        }
        if (officeDocumentExtensions.has(normalizedExt)) {
            const absoluteUrl = buildAbsoluteUrl(fileUrl);
            if (!isPublicViewerUrl(absoluteUrl)) {
                return '';
            }
            return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeOfficeViewerSource(absoluteUrl)}`;
        }
        return '';
    }

    function resolveContentUrl(href, baseUrl) {
        const value = String(href || '').trim();
        if (!value || /^(https?:|mailto:|tel:|#)/i.test(value)) {
            return value;
        }
        try {
            const absoluteBase = baseUrl
                ? new URL(baseUrl, window.location.href).href
                : window.location.href;
            return new URL(value, absoluteBase).href;
        } catch (error) {
            return value;
        }
    }

    function inlineMarkdown(text, baseUrl) {
        let result = escapeHtml(text);
        result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, href) => {
            const src = resolveContentUrl(href, baseUrl);
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
        });
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
            const url = resolveContentUrl(href, baseUrl);
            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
        });
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
        result = result.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
        result = result.replace(/(\*|_)([^*_]+?)\1/g, '<em>$2</em>');
        result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
        return result;
    }

    function markdownToHtml(markdown, baseUrl) {
        const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
        const html = [];
        let inCode = false;
        let codeLines = [];
        let listType = '';
        let paragraphLines = [];

        const closeList = () => {
            if (listType) {
                html.push(`</${listType}>`);
                listType = '';
            }
        };
        const closeParagraph = () => {
            if (paragraphLines.length) {
                html.push(`<p>${inlineMarkdown(paragraphLines.join(' '), baseUrl)}</p>`);
                paragraphLines = [];
            }
        };
        const closeBlocks = () => {
            closeParagraph();
            closeList();
        };

        const isHorizontalRule = line => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
        const splitTableRow = line => {
            const trimmed = String(line || '').trim();
            if (!trimmed.includes('|')) {
                return null;
            }
            let row = trimmed;
            if (row.startsWith('|')) row = row.slice(1);
            if (row.endsWith('|')) row = row.slice(0, -1);
            return row.split('|').map(cell => cell.trim());
        };
        const isTableSeparator = cells => Array.isArray(cells)
            && cells.length > 0
            && cells.every(cell => /^:?-{2,}:?$/.test(cell.trim()));
        const renderTable = (headerCells, separatorCells, bodyRows) => {
            const alignments = separatorCells.map(cell => {
                const value = cell.trim();
                if (value.startsWith(':') && value.endsWith(':')) return 'center';
                if (value.endsWith(':')) return 'right';
                return '';
            });
            const cellAttr = index => alignments[index] ? ` style="text-align:${alignments[index]}"` : '';
            const thead = `<thead><tr>${headerCells.map((cell, index) => `<th${cellAttr(index)}>${inlineMarkdown(cell, baseUrl)}</th>`).join('')}</tr></thead>`;
            const tbody = bodyRows.length
                ? `<tbody>${bodyRows.map(row => `<tr>${headerCells.map((_cell, index) => `<td${cellAttr(index)}>${inlineMarkdown(row[index] || '', baseUrl)}</td>`).join('')}</tr>`).join('')}</tbody>`
                : '';
            return `<table>${thead}${tbody}</table>`;
        };

        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i];
            if (/^\s*(```|~~~)/.test(line)) {
                if (inCode) {
                    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                    codeLines = [];
                    inCode = false;
                } else {
                    closeBlocks();
                    inCode = true;
                }
                continue;
            }

            if (inCode) {
                codeLines.push(line);
                continue;
            }

            if (!line.trim()) {
                closeBlocks();
                continue;
            }

            if (isHorizontalRule(line)) {
                closeBlocks();
                html.push('<hr>');
                continue;
            }

            const setextHeading = lines[i + 1] && line.trim() && lines[i + 1].match(/^\s*(=+|-+)\s*$/);
            if (setextHeading) {
                closeBlocks();
                const level = setextHeading[1].startsWith('=') ? 1 : 2;
                html.push(`<h${level}>${inlineMarkdown(line.trim(), baseUrl)}</h${level}>`);
                i += 1;
                continue;
            }

            const tableHeader = splitTableRow(line);
            const tableSeparator = splitTableRow(lines[i + 1] || '');
            if (tableHeader && isTableSeparator(tableSeparator)) {
                closeBlocks();
                const bodyRows = [];
                i += 2;
                while (i < lines.length) {
                    if (!lines[i].trim() || isHorizontalRule(lines[i])) {
                        i -= 1;
                        break;
                    }
                    const row = splitTableRow(lines[i]);
                    if (!row) {
                        i -= 1;
                        break;
                    }
                    bodyRows.push(row);
                    i += 1;
                }
                html.push(renderTable(tableHeader, tableSeparator, bodyRows));
                continue;
            }

            const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (heading) {
                closeBlocks();
                const level = heading[1].length;
                html.push(`<h${level}>${inlineMarkdown(heading[2], baseUrl)}</h${level}>`);
                continue;
            }

            const blockquote = line.match(/^>\s?(.*)$/);
            if (blockquote) {
                closeBlocks();
                html.push(`<blockquote>${inlineMarkdown(blockquote[1], baseUrl)}</blockquote>`);
                continue;
            }

            const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
            if (task) {
                if (listType !== 'ul') {
                    closeBlocks();
                    html.push('<ul>');
                    listType = 'ul';
                }
                const checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
                html.push(`<li><input type="checkbox" disabled${checked}> ${inlineMarkdown(task[2], baseUrl)}</li>`);
                continue;
            }

            const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
            if (unordered) {
                if (listType !== 'ul') {
                    closeBlocks();
                    html.push('<ul>');
                    listType = 'ul';
                }
                html.push(`<li>${inlineMarkdown(unordered[1], baseUrl)}</li>`);
                continue;
            }

            const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
            if (ordered) {
                if (listType !== 'ol') {
                    closeBlocks();
                    html.push('<ol>');
                    listType = 'ol';
                }
                html.push(`<li>${inlineMarkdown(ordered[1], baseUrl)}</li>`);
                continue;
            }

            closeList();
            paragraphLines.push(line.trim());
        }

        if (inCode) {
            html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        }
        closeBlocks();
        return html.join('\n');
    }

    function computeHighlightIntervals(text, keywords) {
        if (!keywords || keywords.length === 0) {
            return [];
        }
        const comparable = toComparable(text);
        if (!comparable) {
            return [];
        }

        const collapsedChars = [];
        const collapsedToOriginal = [];
        for (let i = 0; i < comparable.length; i++) {
            const ch = comparable[i];
            if (/\s/.test(ch) || ch === '(' || ch === ')') {
                continue;
            }
            collapsedChars.push(ch);
            collapsedToOriginal.push(i);
        }
        const collapsedComparable = collapsedChars.join('');

        const intervals = [];
        const addInterval = (start, end) => {
            if (start >= end) {
                return;
            }
            intervals.push([start, end]);
        };

        keywords.forEach(keyword => {
            const baseKeyword = normalizeForSearch(keyword);
            if (!baseKeyword) {
                return;
            }

            let position = 0;
            while (position < comparable.length) {
                const found = comparable.indexOf(baseKeyword, position);
                if (found === -1) {
                    break;
                }
                addInterval(found, found + baseKeyword.length);
                position = found + Math.max(baseKeyword.length, 1);
            }

            const collapsedKeyword = removeSpacesAndParens(baseKeyword);
            if (!collapsedKeyword || collapsedComparable.length === 0) {
                return;
            }

            let collapsedPosition = 0;
            while (collapsedPosition < collapsedComparable.length) {
                const foundCollapsed = collapsedComparable.indexOf(collapsedKeyword, collapsedPosition);
                if (foundCollapsed === -1) {
                    break;
                }
                const originalStart = collapsedToOriginal[foundCollapsed];
                const originalEnd = collapsedToOriginal[foundCollapsed + collapsedKeyword.length - 1] + 1;
                addInterval(originalStart, originalEnd);
                collapsedPosition = foundCollapsed + Math.max(collapsedKeyword.length, 1);
            }
        });

        if (!intervals.length) {
            return [];
        }

        intervals.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
        const merged = [];
        intervals.forEach(([start, end]) => {
            if (!merged.length || start > merged[merged.length - 1][1]) {
                merged.push([start, end]);
            } else {
                merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
            }
        });
        return merged;
    }

    function countHighlightMatches(text, keywords) {
        return computeHighlightIntervals(text, keywords).length;
    }

    function highlightText(text, keywords) {
        const displayText = normalizeDisplayText(text);
        const intervals = computeHighlightIntervals(displayText, keywords);
        if (!intervals.length) {
            return escapeHtml(displayText);
        }

        let result = '';
        let cursor = 0;
        intervals.forEach(([start, end]) => {
            result += escapeHtml(displayText.slice(cursor, start));
            result += '<mark>' + escapeHtml(displayText.slice(start, end)) + '</mark>';
            cursor = end;
        });
        result += escapeHtml(displayText.slice(cursor));
        return result;
    }

    function calculateMatchScore(item, keywords, searchScope) {
        if (!keywords || keywords.length === 0) {
            return 0;
        }
        const includeTitle = searchScope !== 'file';
        const includeFile = searchScope !== 'title';
        return keywords.reduce((total, keyword) => {
            let score = 0;
            if (includeTitle) {
                score += countOccurrences(item.htmlFileSearch, keyword);
                score += countOccurrences(item.htmlFileCollapsed, keyword);
                score += countOccurrences(item.htmlFileStripped, keyword);
            }
            if (includeFile) {
                score += countOccurrences(item.filenameSearch, keyword);
                score += countOccurrences(item.filenameCollapsed, keyword);
                score += countOccurrences(item.filenameStripped, keyword);
            }
            return total + score;
        }, 0);
    }

    function fileItemFromDetail(note, file) {
        const directoryPath = note.directory_path || '.';
        const filename = file.name || file.path || '파일';
        const comparableTitle = toComparable(directoryPath).trim();
        const comparableName = toComparable(filename).trim();
        return {
            kind: 'file',
            key: `${(note.folder || '').trim()}:::${directoryPath}:::${filename}`,
            htmlFile: directoryPath,
            htmlFileSearch: comparableTitle,
            htmlFileCollapsed: removeSpaces(comparableTitle),
            htmlFileStripped: removeSpacesAndParens(comparableTitle),
            filename,
            filenameSearch: comparableName,
            filenameCollapsed: removeSpaces(comparableName),
            filenameStripped: removeSpacesAndParens(comparableName),
            folder: note.folder,
            directoryPath,
            extension: file.extension || '',
            preview: file.preview || null
        };
    }

    function buildDirectoryItems(note) {
        if (!note) {
            return [];
        }
        const childDirs = Array.isArray(note.child_directories) ? note.child_directories : [];
        const files = Array.isArray(note.file_details) ? note.file_details : [];
        return childDirs.map(dir => ({
            kind: 'directory',
            key: `dir:::${dir.path || dir.name || ''}`,
            filename: dir.name || basename(dir.path),
            htmlFile: dir.path || dir.name || '',
            folder: note.folder,
            directoryPath: dir.path || dir.name || '',
            directoryNote: getDirectoryNote(dir.path || dir.name || ''),
            meta: [
                `파일 ${Number(dir.file_count || 0).toLocaleString()}개`,
                `디렉토리 ${Number(dir.directory_count || 0).toLocaleString()}개`,
                dir.total_size_human || '0 B'
            ].join(' · ')
        })).concat(files.map(file => fileItemFromDetail(note, file)));
    }

    /* SOFTM-dataroom-explorer-shell 2026-05-16: 자료실 오른쪽 패널을 메인 탐색기처럼 제목/메타/액션이 있는 탐색기 표면으로 구성 시작 */
    function createDataroomExplorerShell(titleText, metaText, actions = []) {
        const shell = document.createElement('div');
        shell.className = 'dataroom-explorer-shell';

        const toolbar = document.createElement('div');
        toolbar.className = 'dataroom-explorer-toolbar';

        const title = document.createElement('div');
        title.className = 'dataroom-explorer-title';
        const strong = document.createElement('strong');
        strong.textContent = titleText || '자료실';
        title.appendChild(strong);
        if (metaText) {
            const meta = document.createElement('span');
            meta.textContent = metaText;
            title.appendChild(meta);
        }

        const actionWrap = document.createElement('div');
        actionWrap.className = 'dataroom-explorer-actions';
        actions.filter(Boolean).forEach(action => actionWrap.appendChild(action));

        toolbar.appendChild(title);
        toolbar.appendChild(actionWrap);

        const body = document.createElement('div');
        body.className = 'dataroom-explorer-body';

        shell.appendChild(toolbar);
        shell.appendChild(body);
        shell._body = body;
        return shell;
    }

    function createExplorerButton(label, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dataroom-explorer-action';
        button.textContent = label;
        button.addEventListener('click', handler);
        return button;
    }

    function createExplorerDownloadLink(item) {
        const link = document.createElement('a');
        link.className = 'dataroom-explorer-action';
        link.href = getAttachmentUrl(item);
        link.download = item && item.filename ? item.filename : '';
        link.textContent = '다운로드';
        return link;
    }
    /* SOFTM-dataroom-explorer-shell-END */

    /* SOFTM-dataroom-context-menu 2026-05-16: 메인 탐색기 컨텍스트 메뉴 구성을 자료실 항목에 맞춰 제공 시작 */
    function getDataRoomItemPath(item) {
        if (!item) {
            return '';
        }
        if (item.kind === 'directory') {
            return item.directoryPath || item.htmlFile || item.filename || '';
        }
        return [item.directoryPath || item.htmlFile || '', item.filename || ''].filter(Boolean).join('/');
    }

    function getDataRoomItemAbsoluteUrl(item) {
        if (!item || item.kind !== 'file') {
            return '';
        }
        return new URL(getAttachmentUrl(item), window.location.href).href;
    }

    function copyDataRoomText(text) {
        const value = String(text || '');
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(value).catch(() => {});
            return;
        }
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch (error) {}
        textarea.remove();
    }

    function triggerDataRoomDownload(item) {
        if (!item || item.kind !== 'file') {
            return;
        }
        const link = document.createElement('a');
        link.href = getAttachmentUrl(item);
        link.download = item.filename || '';
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function closeDataRoomActionMenu() {
        const current = document.querySelector('.directory-action-menu');
        if (current) {
            current.remove();
        }
    }

    function createDataRoomMenuButton(label, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.textContent = label;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            handler();
            closeDataRoomActionMenu();
        });
        return button;
    }

    function openDataRoomActionMenu(item, anchor, options = {}) {
        closeDataRoomActionMenu();
        if (!item || !anchor) {
            return;
        }
        const index = currentResults.findIndex(candidate => candidate && candidate.key === item.key);
        const menu = document.createElement('div');
        menu.className = 'directory-action-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', '자료실 항목 작업');

        const title = document.createElement('div');
        title.className = 'directory-action-menu-title';
        title.textContent = item.kind === 'directory' ? '디렉토리 작업' : '파일 작업';
        menu.appendChild(title);

        if (item.kind === 'file') {
            menu.appendChild(createDataRoomMenuButton('뷰어', () => openAttachmentViewerAt(index)));
            menu.appendChild(createDataRoomMenuButton('메인', () => {
                window.location.href = getDataRoomNoteUrl(item);
            }));
            menu.appendChild(createDataRoomMenuButton('새 창에서 열기', () => {
                window.open(getAttachmentUrl(item), '_blank', 'noopener');
            }));
            menu.appendChild(createDataRoomMenuButton('다운로드', () => triggerDataRoomDownload(item)));
            menu.appendChild(createDataRoomMenuButton('경로 복사', () => copyDataRoomText(getDataRoomItemPath(item))));
            menu.appendChild(createDataRoomMenuButton('URL 복사', () => copyDataRoomText(getDataRoomItemAbsoluteUrl(item))));
        } else {
            menu.appendChild(createDataRoomMenuButton('메인', () => {
                window.location.href = getDataRoomNoteUrl(item);
            }));
            menu.appendChild(createDataRoomMenuButton('경로 복사', () => copyDataRoomText(getDataRoomItemPath(item))));
        }

        menu.addEventListener('keydown', (event) => {
            const buttons = Array.from(menu.querySelectorAll('button'));
            const currentIndex = Math.max(0, buttons.indexOf(document.activeElement));
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                event.preventDefault();
                buttons[(currentIndex + 1) % buttons.length].focus();
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                event.preventDefault();
                buttons[(currentIndex - 1 + buttons.length) % buttons.length].focus();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                closeDataRoomActionMenu();
                anchor.focus({ preventScroll: true });
            }
        });
        menu.addEventListener('click', event => event.stopPropagation());
        document.body.appendChild(menu);

        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const baseLeft = typeof options.clientX === 'number' ? options.clientX : rect.left;
        const baseTop = typeof options.clientY === 'number' ? options.clientY : rect.bottom + 6;
        const left = Math.min(baseLeft, window.innerWidth - menuRect.width - 12);
        const top = Math.min(baseTop, window.innerHeight - menuRect.height - 12);
        menu.style.left = `${Math.max(12, left)}px`;
        menu.style.top = `${Math.max(12, top)}px`;
        requestAnimationFrame(() => {
            const firstButton = menu.querySelector('button');
            if (firstButton) {
                firstButton.focus({ preventScroll: true });
            }
        });
    }

    function attachDataRoomContextMenu(node, item) {
        let longPressTimer = null;
        const clearLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };
        node.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            if (!selectedListKeys.has(getDataRoomItemKey(item))) {
                selectDataRoomItem(item, currentResults.findIndex(candidate => candidate && candidate.key === item.key), { skipHistory: true });
            }
            openDataRoomActionMenu(item, node, { clientX: event.clientX, clientY: event.clientY });
        });
        node.addEventListener('touchstart', (event) => {
            clearLongPress();
            const touch = event.touches && event.touches[0];
            longPressTimer = setTimeout(() => {
                if (!selectedListKeys.has(getDataRoomItemKey(item))) {
                    selectDataRoomItem(item, currentResults.findIndex(candidate => candidate && candidate.key === item.key), { skipHistory: true });
                }
                openDataRoomActionMenu(item, node, {
                    clientX: touch ? touch.clientX : undefined,
                    clientY: touch ? touch.clientY : undefined
                });
            }, 520);
        }, { passive: true });
        ['touchend', 'touchcancel', 'touchmove', 'pointercancel', 'scroll'].forEach(type => {
            node.addEventListener(type, clearLongPress, { passive: true });
        });
    }
    /* SOFTM-dataroom-context-menu-END */

    /* SOFTM-dataroom-mobile-concept 2026-05-16: 모바일 자료실 선택 항목 하단 액션 바 구성 시작 */
    function getDataRoomNoteUrl(item) {
        const noteUrl = new URL('index.html', window.location.href);
        noteUrl.searchParams.set('htmlFile', item && item.htmlFile ? item.htmlFile : (item && item.directoryPath ? item.directoryPath : '.'));
        noteUrl.searchParams.set('returnTo', window.location.href);
        return noteUrl.href;
    }

    function createMobileActionButton(label, handler, primary) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        if (primary) {
            button.className = 'primary';
        }
        button.addEventListener('click', handler);
        return button;
    }

    function createMobileActionLink(label, href, download, primary) {
        const link = document.createElement('a');
        link.textContent = label;
        link.href = href;
        if (download) {
            link.download = download;
        }
        if (primary) {
            link.className = 'primary';
        }
        return link;
    }

    function updateMobileActionBar(item, index, selectedCount = 1) {
        const bar = document.getElementById('dataroomMobileActionBar');
        const title = document.getElementById('dataroomMobileActionTitle');
        const meta = document.getElementById('dataroomMobileActionMeta');
        const actions = document.getElementById('dataroomMobileActionButtons');
        if (!bar || !title || !meta || !actions) {
            return;
        }
        actions.innerHTML = '';
        if (!item) {
            bar.classList.remove('is-visible');
            return;
        }
        title.textContent = selectedCount > 1
            ? `${selectedCount}개 항목 선택`
            : (item.kind === 'directory'
                ? (item.htmlFile || item.filename || '디렉토리')
                : (item.filename || '파일'));
        meta.textContent = selectedCount > 1
            ? (item.filename || item.htmlFile || item.directoryPath || '마지막 선택 항목')
            : (item.kind === 'directory'
                ? (item.meta || '디렉토리')
                : [((item.filename || '').split('.').pop() || '').toUpperCase(), item.directoryPath || ''].filter(Boolean).join(' · '));

        if (item.kind === 'file') {
            actions.appendChild(createMobileActionButton('뷰어', () => openAttachmentViewerAt(index), true)); // SOFTM-dataroom-mobile-viewer-action 2026-05-16: 모바일 파일 액션명을 열기에서 뷰어로 변경
            actions.appendChild(createMobileActionLink('메인', getDataRoomNoteUrl(item), '', false)); // SOFTM-dataroom-file-main-link 2026-05-16: 파일도 연결된 메인 페이지로 이동 가능하게 추가
        } else {
            actions.appendChild(createMobileActionLink('메인', getDataRoomNoteUrl(item), '', true));
        }
        bar.classList.add('is-visible');
    }
    /* SOFTM-dataroom-mobile-concept-END */

    /* SOFTM-dataroom-multi-select 2026-05-17: 자료실 결과 목록에 메인 탐색기와 같은 멀티 선택 상태/키보드 제어 연결 시작 */
    function getDataRoomItemKey(item) {
        return item && item.key ? item.key : '';
    }

    function getDataRoomSelectedItems() {
        if (!selectedListKeys || selectedListKeys.size === 0) {
            const selectedItem = currentResults.find(item => getDataRoomItemKey(item) === selectedListKey);
            return selectedItem ? [selectedItem] : [];
        }
        return currentResults.filter(item => selectedListKeys.has(getDataRoomItemKey(item)));
    }

    function refreshDataRoomSelectionState() {
        document.querySelectorAll('#file-list li').forEach(node => {
            const selected = Boolean(node.dataset.key && selectedListKeys.has(node.dataset.key));
            node.classList.toggle('is-selected', selected);
            node.setAttribute('aria-selected', selected ? 'true' : 'false');
            node.tabIndex = node.dataset.key === selectedListKey || (selected && !selectedListKey) ? 0 : -1;
        });
    }

    function applyDataRoomSelectionPreview(item, index, options = {}) {
        selectedListKey = getDataRoomItemKey(item);
        refreshDataRoomSelectionState();
        if (!item) {
            updateMobileActionBar(null, -1);
            return;
        }
        if (item.kind === 'directory') {
            renderDirectoryExplorer(getDirectoryNote(item.directoryPath) || item.directoryNote, [], { skipHistory: true });
        } else {
            currentDirectoryChain = [];
            renderFilePreview(item);
            currentViewerIndex = index;
        }
        updateMobileActionBar(item, index, getDataRoomSelectedItems().length || 1);
        if (options.focus) {
            const node = document.querySelector(`#file-list li[data-key="${CSS.escape(selectedListKey)}"]`);
            if (node) {
                node.focus({ preventScroll: true });
                node.scrollIntoView({ block: 'nearest' });
            }
        }
        if (!options.skipHistory) {
            recordHistory('select');
        }
    }

    function setDataRoomSelection(itemsToSelect, options = {}) {
        const cleanItems = (Array.isArray(itemsToSelect) ? itemsToSelect : [itemsToSelect])
            .filter(item => item && getDataRoomItemKey(item));
        selectedListKeys = new Set(cleanItems.map(getDataRoomItemKey));
        const previewItem = options.previewItem || cleanItems[cleanItems.length - 1] || null;
        if (!options.keepAnchor) {
            selectionAnchorKey = getDataRoomItemKey(previewItem);
        }
        applyDataRoomSelectionPreview(previewItem, currentResults.findIndex(item => getDataRoomItemKey(item) === getDataRoomItemKey(previewItem)), options);
    }

    function toggleDataRoomSelection(item, options = {}) {
        const key = getDataRoomItemKey(item);
        if (!key) {
            return;
        }
        const nextKeys = new Set(selectedListKeys);
        if (nextKeys.has(key)) {
            nextKeys.delete(key);
        } else {
            nextKeys.add(key);
            selectionAnchorKey = key;
        }
        const selectedItems = currentResults.filter(candidate => nextKeys.has(getDataRoomItemKey(candidate)));
        setDataRoomSelection(selectedItems, {
            previewItem: item,
            focus: options.focus,
            keepAnchor: true,
            skipHistory: options.skipHistory
        });
    }

    function selectDataRoomRange(item, options = {}) {
        const targetIndex = currentResults.findIndex(candidate => getDataRoomItemKey(candidate) === getDataRoomItemKey(item));
        if (targetIndex < 0) {
            return;
        }
        const anchorIndex = Math.max(0, currentResults.findIndex(candidate => getDataRoomItemKey(candidate) === (selectionAnchorKey || selectedListKey || getDataRoomItemKey(item))));
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        const rangeItems = currentResults.slice(start, end + 1).filter(candidate => getDataRoomItemKey(candidate));
        const selectedItems = options.additive
            ? getDataRoomSelectedItems().concat(rangeItems.filter(candidate => !selectedListKeys.has(getDataRoomItemKey(candidate))))
            : rangeItems;
        setDataRoomSelection(selectedItems, {
            previewItem: item,
            focus: options.focus,
            keepAnchor: true,
            skipHistory: options.skipHistory
        });
    }

    function handleDataRoomPointerSelection(item, index, event) {
        if (!item) {
            return;
        }
        closeDataRoomActionMenu();
        if (event && event.shiftKey) {
            selectDataRoomRange(item, {
                additive: event.metaKey || event.ctrlKey,
                focus: true,
                skipHistory: true
            });
            return;
        }
        if (event && (event.metaKey || event.ctrlKey)) {
            toggleDataRoomSelection(item, { focus: true, skipHistory: true });
            return;
        }
        selectDataRoomItem(item, index);
    }
    /* SOFTM-dataroom-multi-select-END */

    function renderFilePreview(item) {
        const explorer = document.getElementById('dataroom-explorer');
        if (!explorer || !item || item.kind !== 'file') {
            return;
        }
        explorer.innerHTML = '';
        const currentIndex = currentResults.findIndex(candidate => candidate && candidate.key === item.key);
        const ext = (item.filename.split('.').pop() || '').toUpperCase();
        const shell = createDataroomExplorerShell(
            item.filename || '파일',
            [ext ? `${ext} 파일` : '파일', item.directoryPath || ''].filter(Boolean).join(' · '),
            [
                createExplorerButton('열기', () => openAttachmentViewerAt(currentIndex >= 0 ? currentIndex : currentViewerIndex)),
                createExplorerDownloadLink(item)
            ]
        );
        const wrapper = document.createElement('div');
        wrapper.className = 'dataroom-file-preview';

        const paneMount = document.createElement('div');
        paneMount.className = 'dataroom-file-preview-pane';
        paneMount.appendChild(renderAttachmentViewerPane(item));

        const meta = document.createElement('div');
        meta.className = 'dataroom-file-preview-meta';
        const title = document.createElement('strong');
        title.textContent = item.filename || '';
        const type = document.createElement('span');
        type.textContent = [ext ? `${ext} 파일` : '파일', item.directoryPath || ''].filter(Boolean).join(' · ');
        meta.appendChild(title);
        meta.appendChild(type);

        wrapper.appendChild(paneMount);
        wrapper.appendChild(meta);
        shell._body.appendChild(wrapper);
        explorer.appendChild(shell);
    }

    function renderDirectoryPreview(item, container) {
        container.innerHTML = '';
        if (!item) {
            container.className = 'dataroom-directory-preview dataroom-explorer-empty';
            container.textContent = '항목을 선택하면 미리보기가 표시됩니다.';
            return;
        }
        container.className = 'dataroom-directory-preview';
        if (item.kind === 'directory') {
            const note = getDirectoryNote(item.directoryPath);
            const box = document.createElement('div');
            box.className = 'dataroom-file-preview-meta dataroom-directory-summary'; // SOFTM-dataroom-directory-summary 2026-05-16: 디렉토리 요약 패널을 파일 미리보기 하단 정보와 구분
            const title = document.createElement('strong');
            title.textContent = item.directoryPath || item.filename || '디렉토리';
            const meta = document.createElement('span');
            meta.textContent = note
                ? `파일 ${Number(note.file_count || 0).toLocaleString()}개 · 디렉토리 ${Number(note.directory_count || 0).toLocaleString()}개`
                : '디렉토리';
            box.appendChild(title);
            box.appendChild(meta);
            container.appendChild(box);
            return;
        }
        const preview = document.createElement('div');
        preview.className = 'dataroom-file-preview';
        const pane = document.createElement('div');
        pane.className = 'dataroom-file-preview-pane';
        pane.appendChild(renderAttachmentViewerPane(item));
        const meta = document.createElement('div');
        meta.className = 'dataroom-file-preview-meta';
        const title = document.createElement('strong');
        title.textContent = item.filename || '';
        const type = document.createElement('span');
        type.textContent = item.directoryPath || '';
        meta.appendChild(title);
        meta.appendChild(type);
        preview.appendChild(pane);
        preview.appendChild(meta);
        container.appendChild(preview);
    }

    function getFocusedDataroomColumnButton(button) {
        if (button && button.classList && button.classList.contains('dataroom-column-item')) {
            return button;
        }
        const selected = Array.from(document.querySelectorAll('.dataroom-directory-column .dataroom-column-item.is-selected'));
        return selected[selected.length - 1] || document.querySelector('.dataroom-directory-column .dataroom-column-item');
    }

    function moveDataroomColumnSelection(button, delta) {
        const currentButton = getFocusedDataroomColumnButton(button);
        const column = currentButton && currentButton.closest('.dataroom-directory-column');
        if (!column) {
            return false;
        }
        const buttons = Array.from(column.querySelectorAll('.dataroom-column-item'));
        const currentIndex = Math.max(0, buttons.indexOf(currentButton));
        const nextIndex = Math.max(0, Math.min(buttons.length - 1, currentIndex + delta));
        const nextButton = buttons[nextIndex];
        if (!nextButton || nextButton === currentButton) {
            return true;
        }
        nextButton.focus({ preventScroll: true });
        nextButton.click();
        return true;
    }

    function focusDataroomColumnSelection(container) {
        const root = container || document;
        const selected = Array.from(root.querySelectorAll('.dataroom-directory-column .dataroom-column-item.is-selected'));
        const target = selected[selected.length - 1] || root.querySelector('.dataroom-directory-column .dataroom-column-item');
        if (target) {
            target.focus({ preventScroll: true });
        }
    }

    function renderDirectoryExplorer(rootNote, selectedChain = [], options = {}) {
        const explorer = document.getElementById('dataroom-explorer');
        if (!explorer || !rootNote) {
            return;
        }
        explorer.innerHTML = '';

        const browser = document.createElement('div');
        browser.className = 'dataroom-directory-browser';

        const columns = document.createElement('div');
        columns.className = 'dataroom-directory-columns';

        const preview = document.createElement('aside');
        preview.className = 'dataroom-directory-preview';

        const rootPath = rootNote.directory_path || '.';
        const chain = selectedChain.length ? selectedChain : [rootPath];
        const normalizedChain = chain[0] === rootPath ? chain : [rootPath].concat(chain);
        currentDirectoryChain = normalizedChain.slice();
        let selectedPreviewItem = null;
        const rootItems = buildDirectoryItems(rootNote);
        const rootMeta = `파일 ${Number(rootNote.file_count || 0).toLocaleString()}개 · 디렉토리 ${Number(rootNote.directory_count || 0).toLocaleString()}개`;
        const shell = createDataroomExplorerShell(rootPath || '자료실', rootMeta);
        const split = document.createElement('div');
        split.className = 'dataroom-directory-split';

        normalizedChain.forEach((path, columnIndex) => {
            const note = getDirectoryNote(path);
            if (!note) {
                return;
            }
            const column = document.createElement('div');
            column.className = 'dataroom-directory-column';
            const columnItems = columnIndex === 0 ? rootItems : buildDirectoryItems(note);
            const selectedNextPath = normalizedChain[columnIndex + 1];

            columnItems.forEach(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'dataroom-column-item';
                button.dataset.columnIndex = String(columnIndex);
                button._dataroomItem = item;
                button.appendChild(createMiniIcon(item));

                const text = document.createElement('span');
                text.className = 'dataroom-column-text';
                const name = document.createElement('span');
                name.className = 'dataroom-column-name';
                name.textContent = item.filename || basename(item.directoryPath);
                const meta = document.createElement('span');
                meta.className = 'dataroom-column-meta';
                const itemExt = item.kind === 'file'
                    ? ((item.filename || '').split('.').pop() || '').toUpperCase()
                    : '';
                meta.textContent = item.kind === 'directory'
                    ? (item.meta || '디렉토리')
                    : [itemExt ? `${itemExt} 파일` : '파일', item.directoryPath || ''].filter(Boolean).join(' · ');
                text.appendChild(name);
                text.appendChild(meta);
                button.appendChild(text); // SOFTM-dataroom-main-item-style 2026-05-16: 컬럼 항목을 메인 탐색기처럼 이름+메타 2줄 구조로 구성

                const chevron = document.createElement('span');
                chevron.className = 'dataroom-column-chevron';
                chevron.textContent = item.kind === 'directory' ? '›' : '';
                button.appendChild(chevron);

                if (item.kind === 'directory' && item.directoryPath === selectedNextPath) {
                    button.classList.add('is-selected');
                    selectedPreviewItem = item;
                }

                button.addEventListener('click', () => {
                    columns.querySelectorAll('.dataroom-column-item').forEach(node => node.classList.remove('is-selected'));
                    button.classList.add('is-selected');
                    if (item.kind === 'directory') {
                        const nextChain = normalizedChain.slice(0, columnIndex + 1).concat(item.directoryPath);
                        renderDirectoryExplorer(rootNote, nextChain, { focus: true });
                    } else {
                        while (columns.children.length > columnIndex + 1) {
                            columns.removeChild(columns.lastElementChild);
                        }
                        renderDirectoryPreview(item, preview);
                        selectedListKey = item.key || selectedListKey;
                        currentDirectoryChain = normalizedChain.slice(0, columnIndex + 1);
                        recordHistory('directory-file');
                    }
                });
                button.addEventListener('keydown', (event) => {
                    if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        moveDataroomColumnSelection(button, -1);
                    } else if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        moveDataroomColumnSelection(button, 1);
                    } else if (event.key === 'ArrowRight' && item.kind === 'directory') {
                        event.preventDefault();
                        button.click();
                    } else if (event.key === 'ArrowLeft') {
                        const columnNode = button.closest('.dataroom-directory-column');
                        const previousColumn = columnNode && columnNode.previousElementSibling;
                        const previousSelected = previousColumn && previousColumn.querySelector('.dataroom-column-item.is-selected');
                        if (previousSelected) {
                            event.preventDefault();
                            previousSelected.focus({ preventScroll: true });
                        }
                    } else if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        button.click();
                    }
                });
                attachDataRoomContextMenu(button, item); // SOFTM-dataroom-context-menu 2026-05-16: 자료실 컬럼 항목에도 동일 컨텍스트 메뉴 적용

                column.appendChild(button);
            });
            columns.appendChild(column);
        });

        split.appendChild(columns);
        split.appendChild(preview);
        shell._body.appendChild(split);
        browser.appendChild(shell);
        explorer.appendChild(browser);
        renderDirectoryPreview(selectedPreviewItem || { kind: 'directory', directoryPath: rootPath, filename: basename(rootPath) }, preview);
        if (options.focus) {
            requestAnimationFrame(() => focusDataroomColumnSelection(explorer));
        }
        if (!options.skipHistory) {
            recordHistory('directory');
        }
    }

    function selectDataRoomItem(item, index, options = {}) {
        setDataRoomSelection(item ? [item] : [], {
            previewItem: item,
            focus: options.focus,
            skipHistory: options.skipHistory
        }); // SOFTM-dataroom-multi-select 2026-05-17: 단일 선택도 공통 멀티 선택 상태를 통해 처리
    }

    function focusDataRoomListItem(index) {
        const nodes = Array.from(document.querySelectorAll('#file-list li'));
        if (!nodes.length) {
            return;
        }
        const nextIndex = Math.max(0, Math.min(nodes.length - 1, index));
        const node = nodes[nextIndex];
        const item = currentResults[nextIndex];
        if (item) {
            setDataRoomSelection([item], { previewItem: item, skipHistory: false });
        }
        node.focus({ preventScroll: true });
        node.scrollIntoView({ block: 'nearest' });
    }

    function handleDataRoomListKeydown(event, index) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
            event.preventDefault();
            closeDataRoomActionMenu();
            setDataRoomSelection(currentResults, { previewItem: currentResults[index] || currentResults[0], focus: true, skipHistory: true });
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeDataRoomActionMenu();
            setDataRoomSelection([], { skipHistory: true });
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            const target = currentResults[Math.max(0, index - 1)];
            if (event.shiftKey && target) {
                selectDataRoomRange(target, { focus: true, skipHistory: true });
            } else {
                focusDataRoomListItem(index - 1);
            }
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            const target = currentResults[Math.min(currentResults.length - 1, index + 1)];
            if (event.shiftKey && target) {
                selectDataRoomRange(target, { focus: true, skipHistory: true });
            } else {
                focusDataRoomListItem(index + 1);
            }
        } else if (event.key === 'Home') {
            event.preventDefault();
            if (event.shiftKey && currentResults[0]) {
                selectDataRoomRange(currentResults[0], { focus: true, skipHistory: true });
            } else {
                focusDataRoomListItem(0);
            }
        } else if (event.key === 'End') {
            event.preventDefault();
            const lastItem = currentResults[currentResults.length - 1];
            if (event.shiftKey && lastItem) {
                selectDataRoomRange(lastItem, { focus: true, skipHistory: true });
            } else {
                focusDataRoomListItem(currentResults.length - 1);
            }
        } else if (event.key === ' ') {
            event.preventDefault();
            const item = currentResults[index];
            if (event.metaKey || event.ctrlKey || event.shiftKey) {
                toggleDataRoomSelection(item, { focus: true, skipHistory: true });
            } else if (item) {
                openDataRoomActionMenu(item, event.currentTarget || document.querySelector(`#file-list li[data-index="${index}"]`));
            }
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const item = currentResults[index];
            if (item && item.kind === 'file') {
                openAttachmentViewerAt(index);
            } else if (item) {
                selectDataRoomItem(item, index);
            }
        } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const item = currentResults[index];
            if (item) {
                openDataRoomActionMenu(item, event.currentTarget || document.querySelector(`#file-list li[data-index="${index}"]`));
            }
        }
    } // SOFTM-dataroom-multi-select 2026-05-17: Ctrl/Cmd+A, Esc, Shift+이동, Space 토글, 컨텍스트키를 자료실 목록에 적용

    function getSearchScope() {
        const checkedScope = document.querySelector('input[name="searchScope"]:checked');
        if (checkedScope && ['all', 'title', 'file'].includes(checkedScope.value)) {
            return checkedScope.value;
        }
        const legacyCheckbox = document.getElementById('titleOnlyCheckbox');
        return legacyCheckbox && legacyCheckbox.checked ? 'title' : 'all';
    }

    function setSearchScope(scope) {
        const nextScope = ['all', 'title', 'file'].includes(scope) ? scope : 'all';
        const targetRadio = document.querySelector(`input[name="searchScope"][value="${nextScope}"]`);
        if (targetRadio) {
            targetRadio.checked = true;
        }
        const legacyCheckbox = document.getElementById('titleOnlyCheckbox');
        if (legacyCheckbox) {
            legacyCheckbox.checked = nextScope === 'title';
        }
        currentSearchScope = nextScope;
        return nextScope;
    }

    function syncLegacySearchScope() {
        return setSearchScope(getSearchScope());
    }

    function getSearchScopeLabel(scope) {
        if (scope === 'title') {
            return '디렉토리';
        }
        if (scope === 'file') {
            return '파일명';
        }
        return '전체';
    }

    function getActiveFilterCount() {
        return filterTypes.reduce((total, type) => {
            const checkbox = document.getElementById(`${type}Filter`);
            if (!checkbox || !checkbox.checked) {
                return total;
            }
            const extensionCount = getSelectedExtensions(type).length;
            return total + 1 + extensionCount;
        }, 0);
    }

    function getTotalFilterCount(scope) {
        let total = getActiveFilterCount();
        const resolvedScope = scope || getSearchScope();
        if (resolvedScope && resolvedScope !== 'all') {
            total += 1;
        }
        const loadedFilter = getLoadedTypeFilterValue();
        if (loadedFilter && loadedFilter !== 'all') {
            total += 1;
        }
        return total;
    }

    function getLoadedTypeFilterValue() {
        const select = document.getElementById('loadedTypeFilter');
        return select ? select.value || 'all' : 'all';
    }

    function matchesLoadedTypeFilter(item, value) {
        if (!value || value === 'all') {
            return true;
        }
        if (value === 'directory') {
            return item.kind === 'directory';
        }
        if (item.kind === 'directory') {
            return false;
        }
        const ext = (item.filename.split('.').pop() || '').toLowerCase();
        return value === `ext:${ext}`;
    }

    function updateLoadedTypeFilterOptions(sourceItems) {
        const select = document.getElementById('loadedTypeFilter');
        if (!select) {
            return;
        }
        const previousValue = isRestoringHistory ? loadedTypeFilterValue : (select.value || loadedTypeFilterValue || 'all');
        const extensions = new Map();
        let directoryCount = 0;
        sourceItems.forEach(item => {
            if (item.kind === 'directory') {
                directoryCount += 1;
                return;
            }
            const ext = (item.filename.split('.').pop() || 'no-extension').toLowerCase();
            extensions.set(ext, (extensions.get(ext) || 0) + 1);
        });
        select.innerHTML = '<option value="all">전체</option>';
        if (directoryCount) {
            const option = document.createElement('option');
            option.value = 'directory';
            option.textContent = `디렉토리 (${directoryCount.toLocaleString()})`;
            select.appendChild(option);
        }
        Array.from(extensions.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .forEach(([ext, count]) => {
                const option = document.createElement('option');
                option.value = `ext:${ext}`;
                option.textContent = `${ext.toUpperCase()} (${count.toLocaleString()})`;
                select.appendChild(option);
            });
        select.value = Array.from(select.options).some(option => option.value === previousValue) ? previousValue : 'all';
        loadedTypeFilterValue = select.value;
    }

    function updateSearchStatus(totalCount, visibleCount, rawFilter, hasAttachmentFilters, scope) {
        const status = document.getElementById('searchStatus');
        const badge = document.getElementById('activeFilterBadge');
        const activeFilterCount = getTotalFilterCount(scope);
        if (badge) {
            badge.textContent = String(activeFilterCount);
            badge.classList.toggle('is-visible', activeFilterCount > 0);
        }
        if (!status) {
            return;
        }
        const parts = [`${visibleCount.toLocaleString()} / ${totalCount.toLocaleString()}개`];
        if (rawFilter) {
            parts.push(`검색어 "${rawFilter}"`);
        }
        if (scope && scope !== 'all') {
            parts.push(`범위 ${getSearchScopeLabel(scope)}`);
        }
        if (activeFilterCount > 0) {
            parts.push(`필터 ${activeFilterCount}개`);
        }
        status.textContent = parts.join(' · ');
    }

    function setSearchOptionsOpen(open) {
        const panel = document.getElementById('searchOptionsPanel');
        const toggle = document.getElementById('searchOptionsToggle');
        if (panel) {
            panel.hidden = !open;
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
    }

    function countOccurrences(haystack, needle) {
        if (!needle || !haystack) {
            return 0;
        }
        let total = 0;
        let position = 0;
        while (true) {
            const idx = haystack.indexOf(needle, position);
            if (idx === -1) {
                break;
            }
            total += 1;
            position = idx + needle.length;
        }
        return total;
    }

    document.addEventListener('DOMContentLoaded', () => {
        const fileList = document.getElementById('file-list');
        const searchInput = document.getElementById('searchInput');
        setupExtensionFilters();
        if (fileList) {
            fileList.setAttribute('role', 'listbox');
            fileList.setAttribute('aria-multiselectable', 'true');
            fileList.setAttribute('aria-label', '자료실 검색 결과');
        } // SOFTM-dataroom-multi-select 2026-05-17: 자료실 결과 목록을 접근성 멀티 선택 목록으로 선언
        modal = document.getElementById('myModal');
        modalTitle = modal.querySelector('.modal-title');
        modalBody = modal.querySelector('.modal-body');
        closeModalBtn = modal.querySelector('.close');
        modalPrevBtn = document.getElementById('modalPrevBtn');
        modalNextBtn = document.getElementById('modalNextBtn');
        modalMeta = document.getElementById('modalAttachmentMeta');

        if (closeModalBtn) {
            closeModalBtn.onclick = closeModal;
            closeModalBtn.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    closeModal();
                }
            });
        }
        if (modalPrevBtn) {
            modalPrevBtn.addEventListener('click', () => navigateAttachment(-1));
        }
        if (modalNextBtn) {
            modalNextBtn.addEventListener('click', () => navigateAttachment(1));
        }
        updateModalNavigationState();
        window.onclick = function(event) {
            if (event.target == modal) {
                closeModal();
            }
        };
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.style.display === 'block') {
                closeModal();
            }
        });
        setupHistoryKeyboardShortcuts();

        window.FilesIndexUtils.loadIndex('files.json')
            .then(data => {
                directoryNotes = window.FilesIndexUtils.directoryNotesFromIndex(data);
                directoryNoteMap.clear();
                directoryNotes.forEach(note => {
                    directoryNoteMap.set(String(note.directory_path || '.'), note);
                });

                const rows = window.FilesIndexUtils.attachmentsFromIndex(data);
                const collected = [];

                directoryNotes
                    .filter(note => String(note.directory_path || '.') !== '.')
                    .forEach(note => {
                        const directoryPath = note.directory_path || '.';
                        const comparableTitle = toComparable(directoryPath);
                        const searchTitle = comparableTitle.trim();
                        const collapsedTitle = removeSpaces(searchTitle);
                        const strippedTitle = removeSpacesAndParens(searchTitle);
                        const directoryName = basename(directoryPath);
                        const comparableName = toComparable(directoryName);
                        const searchName = comparableName.trim();
                        collected.push({
                            kind: 'directory',
                            key: `dir:::${directoryPath}`,
                            htmlFile: directoryPath,
                            htmlFileSearch: searchTitle,
                            htmlFileCollapsed: collapsedTitle,
                            htmlFileStripped: strippedTitle,
                            filename: directoryName,
                            filenameSearch: searchName,
                            filenameCollapsed: removeSpaces(searchName),
                            filenameStripped: removeSpacesAndParens(searchName),
                            folder: note.folder,
                            directoryPath,
                            directoryNote: note
                        });
                    });

                rows.forEach(note => {
                    const htmlFile = note.html_file || note.directory_path || '';
                    const comparableTitle = toComparable(htmlFile);
                    const searchTitle = comparableTitle.trim();
                    const collapsedTitle = removeSpaces(searchTitle);
                    const strippedTitle = removeSpacesAndParens(searchTitle);
                    const originalFileName = note.filename || '';
                    const comparableName = toComparable(originalFileName);
                    const searchName = comparableName.trim();
                    const collapsedName = removeSpaces(searchName);
                    const strippedName = removeSpacesAndParens(searchName);
                    collected.push({
                        kind: 'file',
                        key: `${(note.folder || '').trim()}:::${htmlFile}:::${originalFileName}`,
                        htmlFile,
                        htmlFileSearch: searchTitle,
                        htmlFileCollapsed: collapsedTitle,
                        htmlFileStripped: strippedTitle,
                        filename: originalFileName,
                        filenameSearch: searchName,
                        filenameCollapsed: collapsedName,
                        filenameStripped: strippedName,
                        folder: note.folder,
                        directoryPath: note.directory_path || '',
                        extension: note.extension || '',
                        preview: note.preview || null
                    });
                });

                collected.sort((a, b) => {
                    const aPriority = getFolderPriority(a.folder);
                    const bPriority = getFolderPriority(b.folder);
                    if (aPriority !== bPriority) {
                        return aPriority - bPriority;
                    }
                    const titleCompare = (a.htmlFile || '').localeCompare(b.htmlFile || '', undefined, { sensitivity: 'base' });
                    if (titleCompare !== 0) {
                        return titleCompare;
                    }
                    return (a.filename || '').localeCompare(b.filename || '', undefined, { sensitivity: 'base' });
                });

                items = collected;
                currentHighlightKeywords = [];
                currentSearchScope = 'all';

                const titleOnlyCheckbox = document.getElementById('titleOnlyCheckbox');
                const searchButton = document.getElementById('searchButton');
                const clearSearchButton = document.getElementById('clearSearchButton');
                const resetSearchButton = document.getElementById('resetSearchButton');
                const searchOptionsToggle = document.getElementById('searchOptionsToggle');
                const imageFilterCheckbox = document.getElementById('imageFilter');
                const videoFilterCheckbox = document.getElementById('videoFilter');
                const audioFilterCheckbox = document.getElementById('audioFilter');
                const documentFilterCheckbox = document.getElementById('documentFilter');

                const runSearch = () => {
                    const rawFilter = (searchInput.value || '').trim();
                    const searchScope = syncLegacySearchScope();
                    loadedTypeFilterValue = isRestoringHistory ? loadedTypeFilterValue : getLoadedTypeFilterValue();

                    const attachmentFilterState = createEmptyAttachmentFilterState();
                    let hasActiveAttachmentFilters = false;

                    filterTypes.forEach(type => {
                        const checkbox = document.getElementById(`${type}Filter`);
                        const enabled = checkbox ? checkbox.checked : false;
                        const selectedExtensions = enabled ? getSelectedExtensions(type) : [];
                        attachmentFilterState[type].enabled = enabled;
                        attachmentFilterState[type].extensions = new Set(selectedExtensions);
                        updateExtensionVisibility(type, enabled, false);
                        if (enabled) {
                            hasActiveAttachmentFilters = true;
                        }
                    });

                    currentAttachmentFilters = attachmentFilterState;

                    if (!rawFilter && !hasActiveAttachmentFilters) {
                        currentHighlightKeywords = [];
                        currentSearchScope = searchScope;
                        updateLoadedTypeFilterOptions(items);
                        const visibleItems = items.filter(item => matchesLoadedTypeFilter(item, loadedTypeFilterValue));
                        renderList(visibleItems, []);
                        updateSearchStatus(items.length, visibleItems.length, rawFilter, hasActiveAttachmentFilters, searchScope);
                        scheduleHistoryRecord('search');
                        return;
                    }

                    const rawWords = rawFilter.split(/\s+/);
                    const highlightKeywordSet = new Set();
                    const matchKeywordSet = new Set();

                    rawWords.forEach(word => {
                        const normalizedWord = normalizeForSearch(word);
                        if (!normalizedWord) {
                            return;
                        }
                        highlightKeywordSet.add(normalizedWord);
                        matchKeywordSet.add(normalizedWord);

                        const collapsed = removeSpaces(normalizedWord);
                        if (collapsed && collapsed !== normalizedWord) {
                            matchKeywordSet.add(collapsed);
                        }

                        const stripped = removeSpacesAndParens(normalizedWord);
                        if (stripped && stripped !== normalizedWord && stripped !== collapsed) {
                            matchKeywordSet.add(stripped);
                        }
                    });

                    const highlightKeywords = Array.from(highlightKeywordSet);
                    const matchKeywords = Array.from(matchKeywordSet);

                    if (matchKeywords.length === 0 && !hasActiveAttachmentFilters) {
                        currentHighlightKeywords = [];
                        currentSearchScope = searchScope;
                        updateLoadedTypeFilterOptions(items);
                        const visibleItems = items.filter(item => matchesLoadedTypeFilter(item, loadedTypeFilterValue));
                        renderList(visibleItems, []);
                        updateSearchStatus(items.length, visibleItems.length, rawFilter, hasActiveAttachmentFilters, searchScope);
                        scheduleHistoryRecord('search');
                        return;
                    }

                    currentHighlightKeywords = highlightKeywords;
                    currentSearchScope = searchScope;

                    const filteredByAttachment = items.filter(item => {
                        if (item.kind === 'directory') {
                            return !hasActiveAttachmentFilters;
                        }
                        const fileExt = (item.filename.split('.').pop() || '').toLowerCase();
                        return matchesAttachmentFilter(fileExt, currentAttachmentFilters);
                    });

                    const scored = filteredByAttachment
                        .map(item => {
                            const matchScore = calculateMatchScore(item, matchKeywords, searchScope);
                            const highlightScoreTitle = searchScope === 'file' ? 0 : countHighlightMatches(item.htmlFile, highlightKeywords);
                            const highlightScoreAttachment = searchScope === 'title' ? 0 : countHighlightMatches(item.filename, highlightKeywords);
                            const highlightScore = highlightScoreTitle + highlightScoreAttachment;
                            return { item, matchScore, highlightScore };
                        })
                        .filter(entry => matchKeywords.length === 0 || entry.matchScore > 0 || entry.highlightScore > 0)
                        .sort((a, b) => {
                            if (b.highlightScore !== a.highlightScore) {
                                return b.highlightScore - a.highlightScore;
                            }
                            if (b.matchScore !== a.matchScore) {
                                return b.matchScore - a.matchScore;
                            }
                            return a.item.filename.localeCompare(b.item.filename);
                        })
                        .map(entry => entry.item);

                    updateLoadedTypeFilterOptions(scored);
                    const visibleScored = scored.filter(item => matchesLoadedTypeFilter(item, loadedTypeFilterValue));
                    renderList(visibleScored, highlightKeywords);
                    updateSearchStatus(items.length, visibleScored.length, rawFilter, hasActiveAttachmentFilters, searchScope);
                    scheduleHistoryRecord('search');
                };

                runSearchRef = runSearch;

                if (titleOnlyCheckbox) {
                    titleOnlyCheckbox.addEventListener('change', runSearch);
                }
                document.querySelectorAll('input[name="searchScope"]').forEach(radio => {
                    radio.addEventListener('change', runSearch);
                });
                if (searchButton) {
                    searchButton.addEventListener('click', runSearch);
                }
                if (clearSearchButton) {
                    clearSearchButton.addEventListener('click', () => {
                        searchInput.value = '';
                        searchInput.focus();
                        runSearch();
                    });
                }
                if (resetSearchButton) {
                    resetSearchButton.addEventListener('click', () => {
                        searchInput.value = '';
                        setSearchScope('all');
                        filterTypes.forEach(type => {
                            const checkbox = document.getElementById(`${type}Filter`);
                            if (checkbox) {
                                checkbox.checked = false;
                            }
                            const extensionContainer = getExtensionContainer(type);
                            if (extensionContainer) {
                                extensionContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
                                    input.checked = false;
                                });
                            }
                            updateExtensionVisibility(type, false, false);
                        });
                        runSearch();
                    });
                }
                if (searchOptionsToggle) {
                    searchOptionsToggle.addEventListener('click', () => {
                        const isOpen = searchOptionsToggle.getAttribute('aria-expanded') === 'true';
                        setSearchOptionsOpen(!isOpen);
                    });
                }
                const loadedTypeFilter = document.getElementById('loadedTypeFilter');
                if (loadedTypeFilter) {
                    loadedTypeFilter.addEventListener('change', runSearch);
                }
                searchInput.addEventListener('input', runSearch);

                const applyUrlState = (urlParams) => {
                    isRestoringHistory = true;
                    if (historyDebounceTimer) {
                        clearTimeout(historyDebounceTimer);
                        historyDebounceTimer = null;
                    }

                    searchInput.value = urlParams.get('search') || '';
                    selectedListKey = urlParams.get('selected') || '';
                    loadedTypeFilterValue = urlParams.get('loadedFilter') || 'all';
                    const loadedTypeFilter = document.getElementById('loadedTypeFilter');
                    if (loadedTypeFilter) {
                        loadedTypeFilter.value = loadedTypeFilterValue;
                    }

                    const searchScopeParam = urlParams.get('scope');
                    const titleOnlyParam = urlParams.get('titleOnly');
                    if (searchScopeParam) {
                        setSearchScope(searchScopeParam);
                    } else if (titleOnlyParam) {
                        setSearchScope(titleOnlyParam === '1' ? 'title' : 'all');
                    } else {
                        setSearchScope('all');
                    }

                    filterTypes.forEach(type => {
                        const checkbox = document.getElementById(`${type}Filter`);
                        const enabled = urlParams.get(type) === '1';
                        if (checkbox) {
                            checkbox.checked = enabled;
                        }
                        const extensionContainer = getExtensionContainer(type);
                        if (extensionContainer) {
                            extensionContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
                                input.checked = false;
                            });
                            if (enabled) {
                                const extParam = urlParams.get(`${type}_ext`);
                                if (extParam) {
                                    const extensions = new Set(extParam.split(','));
                                    extensions.forEach(ext => {
                                        const extCheckbox = extensionContainer.querySelector(`input[value="${ext}"]`);
                                        if (extCheckbox) {
                                            extCheckbox.checked = true;
                                        }
                                    });
                                }
                            }
                        }
                        updateExtensionVisibility(type, enabled, false);
                    });

                    const shouldOpenOptions = (searchScopeParam && searchScopeParam !== 'all') || titleOnlyParam === '1'
                        || loadedTypeFilterValue !== 'all'
                        || filterTypes.some(type => urlParams.get(type) === '1');
                    setSearchOptionsOpen(Boolean(shouldOpenOptions)); // SOFTM-dataroom-filter-default 2026-05-16: 기본 scope=all URL에서는 필터 패널을 자동으로 펼치지 않음

                    runSearch();

                    const restoredSelected = selectedListKey
                        ? currentResults.find(item => item.key === selectedListKey)
                        : null;
                    if (restoredSelected) {
                        selectDataRoomItem(restoredSelected, currentResults.findIndex(item => item.key === restoredSelected.key), { skipHistory: true });
                    }
                    const chainParam = urlParams.get('chain');
                    if (chainParam && restoredSelected && restoredSelected.kind === 'directory') {
                        const chain = chainParam.split('\n').filter(Boolean);
                        renderDirectoryExplorer(getDirectoryNote(restoredSelected.directoryPath) || restoredSelected.directoryNote, chain, { skipHistory: true });
                    }

                    const viewerKey = urlParams.get('viewer');
                    if (viewerKey) {
                        const viewerIndex = currentResults.findIndex(item => item.key === viewerKey);
                        if (viewerIndex >= 0) {
                            openAttachmentViewerAt(viewerIndex, { pushHistory: false });
                        } else {
                            closeModal({ silent: true });
                        }
                    } else {
                        closeModal({ silent: true });
                    }

                    isRestoringHistory = false;
                };

                applyUrlState(new URLSearchParams(window.location.search));
                window.history.replaceState({ page: 'dataroom', action: 'initial' }, '', getCurrentStateUrl(currentViewerIndex >= 0 ? currentResults[currentViewerIndex] : null));
                window.addEventListener('popstate', () => {
                    applyUrlState(new URLSearchParams(window.location.search));
                });
            });

        if (fileList) {
            scrollContainers.push(fileList);
            fileList.addEventListener('scroll', handleScrollButtonVisibility, { passive: true });
        }

        window.addEventListener('scroll', handleScrollButtonVisibility, { passive: true });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.directory-action-menu')) {
                closeDataRoomActionMenu();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeDataRoomActionMenu();
            }
        }); // SOFTM-dataroom-context-menu 2026-05-16: 자료실 컨텍스트 메뉴를 바깥 클릭/Escape로 닫기
        handleScrollButtonVisibility();

    function renderList(fileItems, highlightKeywords) {
        fileList.innerHTML = '';
        const titleHighlightKeywords = currentSearchScope === 'file' ? [] : highlightKeywords;
        const attachmentHighlightKeywords = currentSearchScope === 'title' ? [] : highlightKeywords;

        const previousKey = (currentViewerIndex >= 0 && currentResults[currentViewerIndex])
            ? currentResults[currentViewerIndex].key
            : null;

        currentResults = Array.isArray(fileItems) ? fileItems.slice() : [];
        selectedListKeys = new Set(Array.from(selectedListKeys).filter(key => currentResults.some(item => getDataRoomItemKey(item) === key)));
        if (selectedListKey && !currentResults.some(item => getDataRoomItemKey(item) === selectedListKey)) {
            selectedListKey = '';
        }
        if (selectedListKey && selectedListKeys.size === 0) {
            selectedListKeys.add(selectedListKey);
        }
        if (previousKey) {
            const nextIndex = currentResults.findIndex(item => item.key === previousKey);
            currentViewerIndex = nextIndex;
        } else {
            currentViewerIndex = -1;
        }

        currentResults.forEach((fileItem, idx) => {
            const li = document.createElement('li');
            li.dataset.index = String(idx);
            li.dataset.key = fileItem.key || '';
            li.dataset.kind = fileItem.kind || 'file'; // SOFTM-dataroom-list-kind 2026-05-16: 자료실 목록 스타일과 테스트에서 항목 유형을 바로 구분
            li.classList.toggle('is-selected', selectedListKeys.has(getDataRoomItemKey(fileItem)));
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', selectedListKeys.has(getDataRoomItemKey(fileItem)) ? 'true' : 'false');
            li.tabIndex = fileItem.key === selectedListKey || (!selectedListKey && idx === 0) ? 0 : -1;
            li.addEventListener('keydown', (event) => handleDataRoomListKeydown(event, idx));

            if (fileItem.kind === 'directory') {
                const fileInfo = document.createElement('div');
                fileInfo.className = 'file-info';

                const row = document.createElement('div');
                row.className = 'attachment-row';
                row.appendChild(createMiniIcon(fileItem));

                const nameButton = document.createElement('button');
                nameButton.type = 'button';
                nameButton.className = 'attach-file dataroom-directory-link';
                nameButton.innerHTML = highlightText(fileItem.htmlFile || fileItem.filename, titleHighlightKeywords);
                nameButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    handleDataRoomPointerSelection(fileItem, idx, event);
                });
                row.appendChild(nameButton);

                const htmlFileSpan = document.createElement('span');
                htmlFileSpan.className = 'html-file';
                htmlFileSpan.textContent = '디렉토리';

                fileInfo.appendChild(row); // SOFTM-dataroom-main-item-style 2026-05-16: 자료실 목록을 아이콘+이름 먼저, 메타 다음 순서로 메인 탐색기와 맞춤
                fileInfo.appendChild(htmlFileSpan);
                li.appendChild(fileInfo);
                li.addEventListener('click', event => handleDataRoomPointerSelection(fileItem, idx, event));
                attachDataRoomContextMenu(li, fileItem);
                fileList.appendChild(li);
                return;
            }

            const filePath = buildAttachmentUrl({
                html_file: fileItem.htmlFile,
                folder: fileItem.folder,
                directory_path: fileItem.directoryPath
            }, fileItem.filename);
            const fileExt = (fileItem.filename.split('.').pop() || '').toLowerCase();
            const openAttachment = (event) => {
                if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
                    return;
                }
                if (event) {
                    event.preventDefault();
                }
                handleDataRoomPointerSelection(fileItem, idx, event);
            };
            const handleKeyActivate = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleDataRoomPointerSelection(fileItem, idx, event);
                }
            };

            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';

            const htmlFileLink = document.createElement('a');
            const noteUrl = new URL('index.html', window.location.href);
            noteUrl.searchParams.set('htmlFile', fileItem.htmlFile);
            noteUrl.searchParams.set('returnTo', window.location.href);
            htmlFileLink.href = noteUrl.href;
            htmlFileLink.innerHTML = highlightText(fileItem.htmlFile, titleHighlightKeywords);
            const htmlFileSpan = document.createElement('span');
            htmlFileSpan.className = 'html-file';
            htmlFileSpan.appendChild(htmlFileLink);

            if (imageExtensions.has(fileExt) || videoExtensions.has(fileExt)) {
                const previewAnchor = document.createElement('a');
                previewAnchor.href = '#';
                previewAnchor.className = 'attachment-preview';
                previewAnchor.setAttribute('role', 'button');
                previewAnchor.tabIndex = 0;

                const thumbSpan = document.createElement('span');
                thumbSpan.className = 'attachment-thumb';

                if (imageExtensions.has(fileExt)) {
                    const img = document.createElement('img');
                    img.alt = fileItem.filename;
                    setupLazyImage(img, filePath);
                    thumbSpan.appendChild(img);
                } else {
                    previewAnchor.classList.add('video');
                    const badge = createFileBadge('video', fileExt);
                    badge.classList.add('attachment-badge');
                    thumbSpan.appendChild(badge);
                }

                const nameSpan = document.createElement('span');
                nameSpan.className = 'attachment-name';
                nameSpan.innerHTML = highlightText(fileItem.filename, attachmentHighlightKeywords);

                previewAnchor.appendChild(thumbSpan);
                previewAnchor.appendChild(nameSpan);
                previewAnchor.addEventListener('click', openAttachment);
                previewAnchor.addEventListener('keydown', handleKeyActivate);

                fileInfo.appendChild(previewAnchor);
                fileInfo.appendChild(htmlFileSpan);

                const downloadLink = document.createElement('a');
                downloadLink.href = filePath;
                downloadLink.download = fileItem.filename;
                downloadLink.className = 'document-download-link';
                downloadLink.textContent = '다운로드';
                fileInfo.appendChild(downloadLink);
            } else {
                const row = document.createElement('div');
                row.className = 'attachment-row';

                const badgeType = documentExtensions.has(fileExt)
                    ? 'document'
                    : (audioExtensions.has(fileExt) ? 'audio' : 'other');
                const badge = createFileBadge(badgeType, fileExt);
                badge.classList.add('attachment-badge');
                row.appendChild(badge);

                const nameLink = document.createElement('a');
                nameLink.className = 'attach-file';
                nameLink.innerHTML = highlightText(fileItem.filename, attachmentHighlightKeywords);

                if (documentExtensions.has(fileExt)) {
                    nameLink.href = '#';
                } else if (audioExtensions.has(fileExt)) {
                    nameLink.href = '#';
                } else {
                    nameLink.href = filePath;
                    nameLink.target = '_blank';
                }
                nameLink.addEventListener('click', openAttachment);
                nameLink.addEventListener('keydown', handleKeyActivate);

                row.appendChild(nameLink);
                fileInfo.appendChild(row);
                fileInfo.appendChild(htmlFileSpan);

                const downloadLink = document.createElement('a');
                downloadLink.href = filePath;
                downloadLink.download = fileItem.filename;
                downloadLink.className = 'document-download-link';
                downloadLink.textContent = '다운로드';
                fileInfo.appendChild(downloadLink);
            }

            li.appendChild(fileInfo);
            li.addEventListener('click', event => handleDataRoomPointerSelection(fileItem, idx, event));
            li.addEventListener('dblclick', () => openAttachmentViewerAt(idx));
            attachDataRoomContextMenu(li, fileItem); // SOFTM-dataroom-context-menu 2026-05-16: 자료실 결과 항목에 메인식 컨텍스트 메뉴 연결
            fileList.appendChild(li);
        });

        const selectedItem = currentResults.find(item => item.key === selectedListKey) || currentResults[0];
        if (selectedItem) {
            if (!selectedListKeys.size) {
                selectedListKeys.add(getDataRoomItemKey(selectedItem));
            }
            applyDataRoomSelectionPreview(selectedItem, currentResults.findIndex(item => item.key === selectedItem.key), { skipHistory: true });
        } else {
            const explorer = document.getElementById('dataroom-explorer');
            if (explorer) {
                explorer.innerHTML = '<div class="dataroom-explorer-empty">표시할 자료가 없습니다.</div>';
            }
        }

        if (modal && modal.style.display === 'block') {
            if (currentViewerIndex >= 0 && currentViewerIndex < currentResults.length) {
                renderAttachmentViewer(currentViewerIndex);
            } else {
                closeModal();
            }
        }
        updateModalNavigationState();
    }
});

    function isTitleOnlySelected() {
        return getSearchScope() === 'title';
    }

    function handleScrollButtonVisibility() {
        const button = document.getElementById('scrollTopBtn');
        if (!button) {
            return;
        }
        const rootScrolled = document.body.scrollTop > 20 || document.documentElement.scrollTop > 20;
        const containerScrolled = scrollContainers.some(el => el.scrollTop > 20);
        if (rootScrolled || containerScrolled) {
            button.style.display = 'block';
        } else {
            button.style.display = 'none';
        }
    }

    function scrollToTop() {
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        scrollContainers.forEach(el => {
            el.scrollTop = 0;
        });
    }

    window.scrollToTop = scrollToTop;
    window.handleAttachmentFilterToggle = handleAttachmentFilterToggle;
})(window, document);
