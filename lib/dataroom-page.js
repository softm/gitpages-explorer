;(function (window, document) {
    const { buildAttachmentUrl, setupLazyImage, getFolderSortOrder } = window.AttachmentUtils;
    const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']);
    const videoExtensions = new Set(['mp4', 'mov', 'webm', 'ogv', 'mkv', 'avi', 'flv', 'wmv']);
    const audioExtensions = new Set(['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', '3gp', 'wma']);
    const documentExtensions = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'hwp', 'hwpx']);
    const officeDocumentExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
    const inlineDocumentExtensions = new Set(['pdf', 'txt', 'csv', 'md']);
    const folderIconSvg = '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M5 13h20l5 6h29v21a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#56b9e8"/><path d="M5 10a5 5 0 0 1 5-5h15l5 6h24a5 5 0 0 1 5 5v5H5z" fill="#83d5f5"/><path d="M5 20h54v20a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#4aaee3"/></svg>';

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

    function openModal() {
        modalReturnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (modal) modal.style.display = 'block';
    }

    function closeModal(options = {}) {
        const wasOpen = modal && modal.style.display === 'block';
        if (modal) modal.style.display = 'none';
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
                preview.innerHTML = markdownToHtml(text, fileUrl);
                source.textContent = text;
            })
            .catch(() => {
                preview.textContent = 'Markdown 문서를 불러오지 못했습니다.';
                source.textContent = '';
            });
    }

    function renderAttachmentViewerPane(item) {
        const pane = document.createElement('div');
        pane.className = 'directory-viewer-pane';
        const fileUrl = getAttachmentUrl(item);
        const fileExt = (item.filename.split('.').pop() || '').toLowerCase();
        const type = getAttachmentType(fileExt);

        if (fileExt === 'md') {
            renderMarkdownSourceViewer(pane, fileUrl);
            return pane;
        }

        if (window.DocumentViewer && window.DocumentViewer.render(pane, fileUrl, fileExt, item.filename || '', item)) {
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

        const fallback = document.createElement('div');
        fallback.className = 'directory-viewer-fallback';
        fallback.appendChild(createFileBadge(type, fileExt));
        const link = document.createElement('a');
        link.href = fileUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '새 창에서 열기';
        fallback.appendChild(link);
        pane.appendChild(fallback);
        return pane;
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

        const prevButton = document.createElement('button');
        prevButton.type = 'button';
        prevButton.textContent = '이전';

        const nextButton = document.createElement('button');
        nextButton.type = 'button';
        nextButton.textContent = '다음';

        const counter = document.createElement('span');
        counter.className = 'directory-viewer-counter';

        nav.appendChild(prevButton);
        nav.appendChild(counter);
        nav.appendChild(nextButton);

        const content = document.createElement('div');
        content.className = 'directory-viewer-content';

        const rail = document.createElement('div');
        rail.className = 'directory-viewer-rail';

        const render = (pushHistory) => {
            const item = viewerItems[selectedIndex];
            currentViewerIndex = currentResults.findIndex(candidate => candidate && candidate.key === item.key);
            modalTitle.textContent = item.filename || 'Viewer';
            counter.textContent = `${selectedIndex + 1} / ${viewerItems.length}`;
            prevButton.disabled = selectedIndex <= 0;
            nextButton.disabled = selectedIndex >= viewerItems.length - 1;
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
        result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        return result;
    }

    function markdownToHtml(markdown, baseUrl) {
        const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
        const html = [];
        let inCode = false;
        let codeLines = [];
        let listType = '';

        const closeList = () => {
            if (listType) {
                html.push(`</${listType}>`);
                listType = '';
            }
        };

        lines.forEach(line => {
            if (/^```/.test(line)) {
                if (inCode) {
                    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                    codeLines = [];
                    inCode = false;
                } else {
                    closeList();
                    inCode = true;
                }
                return;
            }

            if (inCode) {
                codeLines.push(line);
                return;
            }

            if (!line.trim()) {
                closeList();
                return;
            }

            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            if (heading) {
                closeList();
                const level = heading[1].length;
                html.push(`<h${level}>${inlineMarkdown(heading[2], baseUrl)}</h${level}>`);
                return;
            }

            const blockquote = line.match(/^>\s?(.*)$/);
            if (blockquote) {
                closeList();
                html.push(`<blockquote>${inlineMarkdown(blockquote[1], baseUrl)}</blockquote>`);
                return;
            }

            const unordered = line.match(/^\s*[-*]\s+(.+)$/);
            if (unordered) {
                if (listType !== 'ul') {
                    closeList();
                    html.push('<ul>');
                    listType = 'ul';
                }
                html.push(`<li>${inlineMarkdown(unordered[1], baseUrl)}</li>`);
                return;
            }

            const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
            if (ordered) {
                if (listType !== 'ol') {
                    closeList();
                    html.push('<ol>');
                    listType = 'ol';
                }
                html.push(`<li>${inlineMarkdown(ordered[1], baseUrl)}</li>`);
                return;
            }

            closeList();
            html.push(`<p>${inlineMarkdown(line, baseUrl)}</p>`);
        });

        if (inCode) {
            html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        }
        closeList();
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

    function renderFilePreview(item) {
        const explorer = document.getElementById('dataroom-explorer');
        if (!explorer || !item || item.kind !== 'file') {
            return;
        }
        explorer.innerHTML = '';
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
        const ext = (item.filename.split('.').pop() || '').toUpperCase();
        type.textContent = [ext ? `${ext} 파일` : '파일', item.directoryPath || ''].filter(Boolean).join(' · ');
        meta.appendChild(title);
        meta.appendChild(type);

        wrapper.appendChild(paneMount);
        wrapper.appendChild(meta);
        explorer.appendChild(wrapper);
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
            box.className = 'dataroom-file-preview-meta';
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

        normalizedChain.forEach((path, columnIndex) => {
            const note = getDirectoryNote(path);
            if (!note) {
                return;
            }
            const column = document.createElement('div');
            column.className = 'dataroom-directory-column';
            const columnItems = buildDirectoryItems(note);
            const selectedNextPath = normalizedChain[columnIndex + 1];

            columnItems.forEach(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'dataroom-column-item';
                button.dataset.columnIndex = String(columnIndex);
                button._dataroomItem = item;
                button.appendChild(createMiniIcon(item));

                const name = document.createElement('span');
                name.className = 'dataroom-column-name';
                name.textContent = item.filename || basename(item.directoryPath);
                button.appendChild(name);

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

                column.appendChild(button);
            });
            columns.appendChild(column);
        });

        browser.appendChild(columns);
        browser.appendChild(preview);
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
        selectedListKey = item && item.key ? item.key : '';
        document.querySelectorAll('#file-list li').forEach(node => {
            const isSelected = node.dataset.key === selectedListKey;
            node.classList.toggle('is-selected', isSelected);
            node.tabIndex = isSelected ? 0 : -1;
        });
        if (!item) {
            return;
        }
        if (item.kind === 'directory') {
            renderDirectoryExplorer(getDirectoryNote(item.directoryPath) || item.directoryNote, [], { skipHistory: true });
        } else {
            currentDirectoryChain = [];
            renderFilePreview(item);
            currentViewerIndex = index;
        }
        if (!options.skipHistory) {
            recordHistory('select');
        }
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
            selectDataRoomItem(item, nextIndex);
        }
        node.focus({ preventScroll: true });
        node.scrollIntoView({ block: 'nearest' });
    }

    function handleDataRoomListKeydown(event, index) {
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            focusDataRoomListItem(index - 1);
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            focusDataRoomListItem(index + 1);
        } else if (event.key === 'Home') {
            event.preventDefault();
            focusDataRoomListItem(0);
        } else if (event.key === 'End') {
            event.preventDefault();
            focusDataRoomListItem(currentResults.length - 1);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const item = currentResults[index];
            if (item && item.kind === 'file') {
                openAttachmentViewerAt(index);
            } else if (item) {
                selectDataRoomItem(item, index);
            }
        }
    }

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

                    const shouldOpenOptions = searchScopeParam || titleOnlyParam === '1'
                        || loadedTypeFilterValue !== 'all'
                        || filterTypes.some(type => urlParams.get(type) === '1');
                    setSearchOptionsOpen(Boolean(shouldOpenOptions));

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
        handleScrollButtonVisibility();

    function renderList(fileItems, highlightKeywords) {
        fileList.innerHTML = '';
        const titleHighlightKeywords = currentSearchScope === 'file' ? [] : highlightKeywords;
        const attachmentHighlightKeywords = currentSearchScope === 'title' ? [] : highlightKeywords;

        const previousKey = (currentViewerIndex >= 0 && currentResults[currentViewerIndex])
            ? currentResults[currentViewerIndex].key
            : null;

        currentResults = Array.isArray(fileItems) ? fileItems.slice() : [];
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
            li.classList.toggle('is-selected', fileItem.key === selectedListKey);
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
                    selectDataRoomItem(fileItem, idx);
                });
                row.appendChild(nameButton);

                const htmlFileSpan = document.createElement('span');
                htmlFileSpan.className = 'html-file';
                htmlFileSpan.textContent = '디렉토리';

                fileInfo.appendChild(row);
                fileInfo.appendChild(htmlFileSpan);
                li.appendChild(fileInfo);
                li.addEventListener('click', () => selectDataRoomItem(fileItem, idx));
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
                selectDataRoomItem(fileItem, idx);
            };
            const handleKeyActivate = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectDataRoomItem(fileItem, idx);
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
            fileInfo.appendChild(htmlFileSpan);

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

                const downloadLink = document.createElement('a');
                downloadLink.href = filePath;
                downloadLink.download = fileItem.filename;
                downloadLink.className = 'document-download-link';
                downloadLink.textContent = '다운로드';
                fileInfo.appendChild(downloadLink);
            }

            li.appendChild(fileInfo);
            li.addEventListener('click', () => selectDataRoomItem(fileItem, idx));
            li.addEventListener('dblclick', () => openAttachmentViewerAt(idx));
            fileList.appendChild(li);
        });

        const selectedItem = currentResults.find(item => item.key === selectedListKey) || currentResults[0];
        if (selectedItem) {
            selectDataRoomItem(selectedItem, currentResults.findIndex(item => item.key === selectedItem.key), { skipHistory: true });
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
