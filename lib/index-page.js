(function (window, document) {
    const { buildAttachmentUrl, getFolderSortOrder } = window.AttachmentUtils;
    const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']);
    const videoExtensions = new Set(['mp4', 'mov', 'webm', 'ogv', 'mkv', 'avi', 'flv', 'wmv']);
    const audioExtensions = new Set(['mp3', 'm4a', 'aac', 'ogg', 'wav', 'flac', '3gp', 'wma']);
    const documentExtensions = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'hwp', 'hwpx']);
    const officeDocumentExtensions = new Set(['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
    const inlineDocumentExtensions = new Set(['pdf', 'txt', 'csv', 'md']);
    const iconPreviewExtensions = new Set([
        'pdf', 'html', 'htm', 'txt', 'csv', 'md', 'json', 'xml', 'css', 'js', 'mjs',
        'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs',
        'php', 'rb', 'sh', 'yml', 'yaml', 'toml', 'ini', 'log', 'sql'
    ]);

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
    const shareIcons = {
        toggle: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 12h8M12 8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7.5 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16.5 14.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM7.5 21.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10.1 7l3.8 2.4M10.1 17l3.8-2.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>`,
        facebook: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.99 3.66 9.12 8.44 9.88v-6.99H8.08v-2.89h2.36V9.83c0-2.33 1.38-3.62 3.5-3.62.7 0 1.82.12 2.27.18v2.5h-1.28c-1.26 0-1.65.79-1.65 1.6v1.92h2.8l-.45 2.89h-2.35v6.99C18.34 21.12 22 16.99 22 12z"/></svg></span>`,
        x: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M17.53 3H21l-7.58 8.66L22.34 21h-6.98l-5.47-6.8L3.63 21H.16l8.1-9.25L-.3 3h7.16l4.94 6.17L17.53 3zm-1.22 16.35h1.92L5.82 4.56H3.76z"/></svg></span>`,
        linkedin: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M4.98 3.5a2.5 2.5 0 11-.01 5.01 2.5 2.5 0 01.01-5.01zM3 8.98h3.96V21H3zM9.5 8.98h3.8v1.64h.05c.53-1.01 1.83-2.07 3.77-2.07 4.03 0 4.77 2.65 4.77 6.1V21h-3.96v-6.52c0-1.56-.03-3.57-2.17-3.57-2.17 0-2.5 1.7-2.5 3.45V21H9.5z"/></svg></span>`,
        threads: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12.15 22C6.66 22 3 18.18 3 12.45 3 6.75 6.62 2 12.35 2c4.1 0 6.95 2.16 8.02 6.08l-1.92.52c-.83-3.05-2.9-4.63-6.1-4.63-4.56 0-7.32 3.58-7.32 8.48 0 4.6 2.72 7.58 7.12 7.58 4.11 0 6.83-2.19 6.83-5.45 0-1.19-.37-2.12-1.12-2.78-.69 3.14-2.74 4.89-5.73 4.89-2.57 0-4.36-1.45-4.36-3.55 0-2.22 1.89-3.69 4.75-3.69 1.2 0 2.27.16 3.2.47-.31-2.04-1.54-3.05-3.72-3.05-1.48 0-2.77.42-3.84 1.25L7.05 6.5c1.4-1.05 3.06-1.58 4.95-1.58 3.74 0 5.73 2.05 5.92 6.09 2 .87 3.05 2.1 3.05 3.62C20.97 19 17.42 22 12.15 22zm.12-7.19c1.82 0 3.05-1.14 3.42-3.03-.86-.36-1.91-.54-3.13-.54-1.75 0-2.82.69-2.82 1.82 0 1.05.98 1.75 2.53 1.75z"/></svg></span>`,
        kakao: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4C6.48 4 2 7.47 2 11.75c0 2.72 1.82 5.11 4.56 6.49L5.85 21l3.38-1.9c.88.25 1.81.4 2.77.4 5.52 0 10-3.47 10-7.75S17.52 4 12 4z"/></svg></span>`,
        email: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></span>`,
        native: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4l4 4h-3v5h-2V8H8l4-4zM5 12v8h14v-8h-2v6H7v-6z"/></svg></span>`,
        copy: `<span class="share-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4a2 2 0 00-2 2v14h2V3h12zM19 5h-9a2 2 0 00-2 2v14a2 2 0 002 2h9a2 2 0 002-2V7a2 2 0 00-2-2zm0 16h-9V7h9z"/></svg></span>`
    };
    const shareTargets = [
        {
            network: 'facebook',
            label: 'Facebook',
            icon: shareIcons.facebook,
            buildUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
        },
        {
            network: 'x',
            label: 'X',
            icon: shareIcons.x,
            buildUrl: (url, text) => `https://x.com/intent/post?text=${encodeURIComponent(`${text}\n${url}`)}`
        },
        {
            network: 'linkedin',
            label: 'LinkedIn',
            icon: shareIcons.linkedin,
            buildUrl: (url, text) => `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`
        },
        {
            network: 'threads',
            label: 'Threads',
            icon: shareIcons.threads,
            buildUrl: (url, text) => `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text}\n${url}`)}`
        },
        {
            network: 'kakao',
            label: '카카오톡',
            icon: shareIcons.kakao,
            buildUrl: (url, text) => `kakaolink://sendurl?msg=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&appid=farm-index&appver=1.0`,
            fallbackMessage: '카카오톡이 열리지 않으면 링크 복사를 사용하세요.'
        },
        {
            network: 'email',
            label: '이메일',
            icon: shareIcons.email,
            buildUrl: (url, text) => `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`
        }
    ];
    const SHARE_WINDOW_FEATURES = 'noopener,noreferrer,width=600,height=540';
    const directoryViewModes = [
        { id: 'grid', label: '아이콘 보기' },
        { id: 'list', label: '목록 보기' },
        { id: 'columns', label: '계층 보기' },
        { id: 'gallery', label: '갤러리 보기' }
    ];
    const directoryViewIcons = {
        grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="4" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="14" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="14" width="6" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        list: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="6" r="1.6" fill="currentColor"/><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="5" cy="18" r="1.6" fill="currentColor"/><path d="M9 6h11M9 12h11M9 18h11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        columns: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="5" height="14" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9.5" y="5" width="5" height="14" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="15.5" y="5" width="5" height="14" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
        gallery: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 20h10M9 17v3M15 17v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    };
    const previewToggleIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14 5v14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.5 9h4M6.5 12h4M6.5 15h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const folderIconSvg = '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M5 13h20l5 6h29v21a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#56b9e8"/><path d="M5 10a5 5 0 0 1 5-5h15l5 6h24a5 5 0 0 1 5 5v5H5z" fill="#83d5f5"/><path d="M5 20h54v20a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill="#4aaee3"/></svg>';
    const DIRECTORY_VIEW_STORAGE_KEY = 'directoryBrowser.viewMode';
    const DIRECTORY_PREVIEW_STORAGE_KEY = 'directoryBrowser.previewVisible';
    const DIRECTORY_SPLIT_STORAGE_KEY = 'directoryBrowser.listWidth';
    const DIRECTORY_GALLERY_SPLIT_STORAGE_KEY = 'directoryBrowser.galleryPreviewHeight';
    const DIRECTORY_GALLERY_INFO_SPLIT_STORAGE_KEY = 'directoryBrowser.galleryInfoWidth';

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
                checkbox.dataset.filterType = type;
                checkbox.addEventListener('change', () => searchFiles());

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(ext.toUpperCase()));
                container.appendChild(label);
            });
        });
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
        searchFiles();
    }

    function getFolderPriority(folderName) {
        const key = toComparable(folderName || '');
        if (folderPriorityMap.has(key)) {
            return folderPriorityMap.get(key);
        }
        return DEFAULT_FOLDER_PRIORITY;
    }

    function createFileBadge(type, ext) {
        const badge = document.createElement('span');
        badge.className = 'file-badge';
        badge.dataset.type = type || 'other';
        if (type === 'document' && ext) {
            badge.textContent = ext.toUpperCase();
        } else if (type === 'video') {
            badge.textContent = 'VID';
        } else if (type === 'audio') {
            badge.textContent = 'AUD';
        } else if (ext) {
            badge.textContent = ext.toUpperCase();
        } else {
            badge.textContent = '?';
        }
        return badge;
    }

    function getShareTitle(note) {
        if (!note || !note.html_file) {
            return document.title || '내 노트';
        }
        const raw = note.html_file;
        const segments = raw.split('/');
        const lastSegment = segments.length ? segments[segments.length - 1] : raw;
        return lastSegment.replace(/\.html$/i, '');
    }

    function buildShareLinkForNote(note) {
        if (!note || !note.html_file) {
            return '';
        }
        const htmlFile = note.html_file;
        try {
            const hasWindow = typeof window !== 'undefined';
            const origin = hasWindow && window.location ? (window.location.origin || '') : '';
            let basePath = hasWindow && window.location ? (window.location.pathname || '') : '';
            if (!basePath || basePath === '') {
                basePath = 'index.html';
            }
            if (basePath === '/') {
                basePath = '/index.html';
            }
            const baseUrl = origin
                ? new URL(basePath, origin)
                : new URL(basePath, hasWindow && window.location ? window.location.href : undefined);
            baseUrl.search = '';
            baseUrl.hash = '';
            baseUrl.searchParams.set('htmlFile', htmlFile);
            return baseUrl.href;
        } catch (error) {
            return `index.html?htmlFile=${encodeURIComponent(htmlFile)}`;
        }
    }

    function canUseNativeShare() {
        return typeof navigator !== 'undefined' && navigator && typeof navigator.share === 'function';
    }

    function openShareWindow(shareUrl) {
        if (!shareUrl) {
            return;
        }
        const opened = window.open(shareUrl, '_blank', SHARE_WINDOW_FEATURES);
        if (opened && typeof opened.focus === 'function') {
            opened.focus();
        }
    }

    function setShareFeedback(element, message, isError) {
        if (!element) {
            return;
        }
        element.textContent = message || '';
        if (isError) {
            element.classList.add('share-feedback--error');
        } else {
            element.classList.remove('share-feedback--error');
        }
        if (element._shareFeedbackTimer) {
            clearTimeout(element._shareFeedbackTimer);
        }
        if (message) {
            element._shareFeedbackTimer = setTimeout(() => {
                element.textContent = '';
                element.classList.remove('share-feedback--error');
                element._shareFeedbackTimer = null;
            }, 3000);
        }
    }

    async function copyShareLink(url, feedbackEl) {
        if (!url) {
            setShareFeedback(feedbackEl, '공유할 링크가 없습니다.', true);
            return;
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(url);
                setShareFeedback(feedbackEl, '링크를 복사했습니다.');
                return;
            }
        } catch (error) {
            // Continue to fallback
        }
        let copied = false;
        try {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.top = '-1000px';
            document.body.appendChild(textarea);
            textarea.select();
            copied = document.execCommand('copy');
            document.body.removeChild(textarea);
        } catch (error) {
            copied = false;
        }
        if (copied) {
            setShareFeedback(feedbackEl, '링크를 복사했습니다.');
            return;
        }
        window.prompt('아래 링크를 복사해 공유하세요:', url);
        setShareFeedback(feedbackEl, '클립보드 복사에 실패했습니다. 링크를 직접 복사하세요.', true);
    }

    function createShareSection(shareTitle, shareUrl) {
        if (!shareUrl) {
            return null;
        }
        const section = document.createElement('section');
        section.className = 'share-section';

        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'share-toggle-button';
        toggleButton.innerHTML = shareIcons.toggle;
        toggleButton.setAttribute('aria-label', '공유');
        toggleButton.setAttribute('aria-expanded', 'false');
        toggleButton.title = '공유';
        section.appendChild(toggleButton);

        const panel = document.createElement('div');
        panel.className = 'share-panel';
        panel.hidden = true;

        const buttons = document.createElement('div');
        buttons.className = 'share-buttons';
        panel.appendChild(buttons);

        const feedbackEl = document.createElement('div');
        feedbackEl.className = 'share-feedback';

        const safeTitle = shareTitle || document.title || '내 노트';

        shareTargets.forEach(target => {
            try {
                const shareLink = target.buildUrl(shareUrl, safeTitle);
                if (!shareLink) {
                    return;
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'share-button';
                button.dataset.network = target.network;
                if (target.icon) {
                    button.innerHTML = target.icon;
                } else {
                button.textContent = target.label;
                }
                button.setAttribute('aria-label', target.label);
                button.title = target.label;
                button.addEventListener('click', () => {
                    if (target.network === 'kakao') {
                        if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) {
                            window.location.href = shareLink;
                        }
                        copyShareLink(shareUrl, feedbackEl);
                        setShareFeedback(feedbackEl, target.fallbackMessage || '카카오톡 공유가 열리지 않으면 링크를 붙여넣으세요.');
                        return;
                    }
                    openShareWindow(shareLink);
                    if (target.fallbackMessage) {
                        setShareFeedback(feedbackEl, target.fallbackMessage);
                    }
                });
                buttons.appendChild(button);
            } catch (error) {
                // Skip invalid target
            }
        });

        if (canUseNativeShare()) {
            const nativeButton = document.createElement('button');
            nativeButton.type = 'button';
            nativeButton.className = 'share-button';
            nativeButton.dataset.network = 'native';
            nativeButton.innerHTML = shareIcons.native;
            nativeButton.setAttribute('aria-label', '기기 공유');
            nativeButton.title = '기기 공유';
            nativeButton.addEventListener('click', async () => {
                try {
                    await navigator.share({ title: safeTitle, url: shareUrl });
                } catch (error) {
                    if (!error || error.name !== 'AbortError') {
                        setShareFeedback(feedbackEl, '공유를 완료하지 못했습니다.', true);
                    }
                }
            });
            buttons.appendChild(nativeButton);
        }

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'share-button';
        copyButton.dataset.network = 'copy';
        copyButton.innerHTML = shareIcons.copy;
        copyButton.setAttribute('aria-label', '링크 복사');
        copyButton.title = '링크 복사';
        copyButton.addEventListener('click', () => copyShareLink(shareUrl, feedbackEl));
        buttons.appendChild(copyButton);

        panel.appendChild(feedbackEl);
        section.appendChild(panel);

        const outsideClickHandler = (event) => {
            if (!section.contains(event.target)) {
                setExpanded(false);
            }
        };
        const positionPanel = () => {
            const rect = toggleButton.getBoundingClientRect();
            const gap = 8;
            panel.style.top = `${Math.round(rect.bottom + gap)}px`;
            panel.style.right = `${Math.max(12, Math.round(window.innerWidth - rect.right))}px`;
        };
        const setExpanded = (expanded) => {
            panel.hidden = !expanded;
            toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            section.classList.toggle('is-open', expanded);
            if (expanded) {
                positionPanel();
                document.addEventListener('click', outsideClickHandler);
                window.addEventListener('resize', positionPanel);
                window.addEventListener('scroll', positionPanel, true);
            } else {
                document.removeEventListener('click', outsideClickHandler);
                window.removeEventListener('resize', positionPanel);
                window.removeEventListener('scroll', positionPanel, true);
            }
        };
        toggleButton.addEventListener('click', (event) => {
            event.stopPropagation();
            setExpanded(panel.hidden);
        });
        section.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                setExpanded(false);
                toggleButton.focus();
            }
        });

        return section;
    }

    function buildNoteDisplayTitle(note) {
        if (!note) {
            return '';
        }
        const readableTitle = getShareTitle(note);
        const folder = note.folder || '';
        if (folder && readableTitle && !readableTitle.startsWith(folder)) {
            return `${folder} · ${readableTitle}`;
        }
        return readableTitle || folder || '';
    }

    function renderDirectorySummary(note) {
        const wrapper = document.createElement('section');
        wrapper.className = 'directory-summary';

        const meta = document.createElement('div');
        meta.className = 'modal-note';
        meta.textContent = [
            `경로: ${note.directory_path || '.'}`,
            `파일 ${Number(note.file_count || 0).toLocaleString()}개`,
            `디렉토리 ${Number(note.directory_count || 0).toLocaleString()}개`,
            `용량 ${note.total_size_human || '0 B'}`
        ].join(' · ');
        wrapper.appendChild(meta);

        const childDirs = Array.isArray(note.child_directories) ? note.child_directories : [];
        if (childDirs.length > 0) {
            const heading = document.createElement('h3');
            heading.textContent = '하위 디렉토리';
            wrapper.appendChild(heading);

            const list = document.createElement('ul');
            childDirs.forEach(dir => {
                const li = document.createElement('li');
                li.textContent = `${dir.path} (${Number(dir.file_count || 0).toLocaleString()} files · ${dir.total_size_human || '0 B'})`;
                list.appendChild(li);
            });
            wrapper.appendChild(list);
        }

        return wrapper;
    }

    function getDirectoryNoteIndex(path) {
        const target = String(path || '.');
        return notes.findIndex(item => String(item.directory_path || '.') === target);
    }

    function getDirectoryNoteByPath(path) {
        const noteIndex = getDirectoryNoteIndex(path || '.');
        return noteIndex >= 0 ? notes[noteIndex] : null;
    }

    function findDirectoryBrowserItemByPath(path) {
        const normalizedPath = String(path || '');
        if (!normalizedPath) {
            return null;
        }
        for (const note of notes) {
            const item = buildDirectoryBrowserItems(note).find(candidate => candidate.path === normalizedPath);
            if (item) {
                return item;
            }
        }
        return null;
    }

    function getDirectoryColumnPathChain(basePath, targetPath, targetKind) {
        const base = String(basePath || '.');
        const target = String(targetPath || '');
        if (!target || !target.startsWith(base)) {
            return [base];
        }
        const targetParts = target.split('/').filter(Boolean);
        const baseParts = base.split('/').filter(Boolean);
        const directoryDepth = targetKind === 'directory' ? targetParts.length : Math.max(baseParts.length, targetParts.length - 1);
        const chain = [base];
        for (let depth = baseParts.length + 1; depth <= directoryDepth; depth += 1) {
            const candidate = targetParts.slice(0, depth).join('/');
            if (candidate && getDirectoryNoteByPath(candidate)) {
                chain.push(candidate);
            }
        }
        return chain;
    }

    function getCurrentDirectoryBrowserSection() {
        return document.querySelector('#content .directory-browser');
    }

    function getCurrentHistoryStateUrl(viewerItem) {
        const params = new URLSearchParams(window.location.search);
        const note = Number.isInteger(currentSelectedIndex) ? notes[currentSelectedIndex] : null;
        const section = getCurrentDirectoryBrowserSection();
        const selectedItem = section && section._selectedDirectoryItem;

        if (note && note.html_file) {
            params.set('htmlFile', note.html_file);
        } else {
            params.delete('htmlFile');
        }
        if (selectedItem && selectedItem.path) {
            params.set('item', selectedItem.path);
        } else {
            params.delete('item');
        }
        if (section && section.dataset.viewMode) {
            params.set('view', section.dataset.viewMode);
        } else {
            params.delete('view');
        }
        if (section && section.dataset.previewVisible) {
            params.set('preview', section.dataset.previewVisible === 'true' ? '1' : '0');
        } else {
            params.delete('preview');
        }
        if (viewerItem && viewerItem.path) {
            params.set('viewer', viewerItem.path);
        } else {
            params.delete('viewer');
        }

        const query = params.toString();
        return `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
    }

    function recordDirectoryHistory(action, options = {}) {
        if (isApplyingHistoryState || !window.history || !window.location) {
            return;
        }
        if (historyDebounceTimer) {
            clearTimeout(historyDebounceTimer);
            historyDebounceTimer = null;
        }
        const url = getCurrentHistoryStateUrl(options.viewerItem || null);
        const currentUrl = window.location.pathname + window.location.search + window.location.hash;
        const state = { page: 'index', action };
        if (options.replace || currentUrl === url) {
            window.history.replaceState(state, '', url);
            return;
        }
        window.history.pushState(state, '', url);
    }

    function scheduleDirectoryHistory(action, options = {}) {
        if (isApplyingHistoryState) {
            return;
        }
        if (historyDebounceTimer) {
            clearTimeout(historyDebounceTimer);
        }
        historyDebounceTimer = setTimeout(() => {
            historyDebounceTimer = null;
            recordDirectoryHistory(action, options);
        }, options.delay || 350);
    }

    function applyDirectoryUrlState(params) {
        if (historyDebounceTimer) {
            clearTimeout(historyDebounceTimer);
            historyDebounceTimer = null;
        }
        isApplyingHistoryState = true;
        try {
            const htmlFile = params.get('htmlFile');
            const itemPath = params.get('item');
            const viewMode = params.get('view');
            const previewParam = params.get('preview');
            const viewerPath = params.get('viewer');

            if (htmlFile) {
                const note = notes.find(item => item.html_file === htmlFile);
                if (note) {
                    showFileContent(note._index, { skipHistory: true });
                }
            } else {
                currentSelectedIndex = null;
                updateSelectedListHighlight(false);
                document.querySelector('.container').classList.remove('mobile-content-visible');
                const contentDiv = document.getElementById('content');
                if (contentDiv) {
                    contentDiv.innerHTML = '';
                }
            }

            const section = getCurrentDirectoryBrowserSection();
            if (section) {
                if (previewParam === '1' || previewParam === '0') {
                    section.dataset.previewVisible = previewParam === '1' ? 'true' : 'false';
                    const previewButton = section.querySelector('.preview-toggle-button');
                    if (previewButton) {
                        previewButton.setAttribute('aria-pressed', section.dataset.previewVisible === 'true' ? 'true' : 'false');
                    }
                }
                if (viewMode && directoryViewModes.some(mode => mode.id === viewMode)) {
                    section.dataset.viewMode = viewMode;
                    const controls = section.querySelector('.view-mode-control');
                    if (controls) {
                        controls.querySelectorAll('.view-mode-button').forEach(button => {
                            button.setAttribute('aria-pressed', button.dataset.viewMode === viewMode ? 'true' : 'false');
                        });
                    }
                    if (viewMode === 'columns') {
                        const targetItem = itemPath ? findDirectoryBrowserItemByPath(itemPath) : null;
                        const chain = targetItem
                            ? getDirectoryColumnPathChain(section._directoryNote.directory_path || '.', targetItem.path, targetItem.kind)
                            : undefined;
                        renderDirectoryColumns(section, chain, { skipHistory: true });
                    } else {
                        renderDirectoryFlatItems(section, { skipHistory: true });
                    }
                }

                const targetItem = itemPath ? findDirectoryBrowserItemByPath(itemPath) : null;
                if (targetItem) {
                    if (section.dataset.viewMode === 'columns') {
                        renderDirectoryColumns(
                            section,
                            getDirectoryColumnPathChain(section._directoryNote.directory_path || '.', targetItem.path, targetItem.kind),
                            { skipHistory: true }
                        );
                    }
                    updateDirectoryPreview(section, targetItem, { focus: true, skipHistory: true });
                }

                if (viewerPath) {
                    const viewerItem = findDirectoryBrowserItemByPath(viewerPath);
                    if (viewerItem && viewerItem.kind === 'file') {
                        openDirectoryViewer(section, viewerItem, { skipHistory: true });
                    }
                } else if (modal && modal.style.display === 'block') {
                    closeModal({ skipHistory: true });
                }
            }
        } finally {
            isApplyingHistoryState = false;
        }
    }

    function navigateToDirectoryPath(path) {
        const noteIndex = getDirectoryNoteIndex(path || '.');
        if (noteIndex >= 0) {
            showFileContent(noteIndex);
        }
    }

    function buildDirectoryPathSegments(path) {
        const normalized = String(path || '.');
        if (normalized === '.' || !normalized) {
            return [{ label: '.', path: '.' }];
        }
        const parts = normalized.split('/').filter(Boolean);
        return parts.map((part, index) => ({
            label: part,
            path: parts.slice(0, index + 1).join('/')
        }));
    }

    function renderDirectoryPathLinks(path, options = {}) {
        const wrapper = document.createElement('span');
        wrapper.className = options.className || 'directory-path-links';

        buildDirectoryPathSegments(path).forEach((segment, index) => {
            if (index > 0) {
                const separator = document.createElement('span');
                separator.className = 'directory-path-separator';
                separator.textContent = '/';
                wrapper.appendChild(separator);
            }

            const noteIndex = getDirectoryNoteIndex(segment.path);
            if (noteIndex >= 0) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'directory-path-link';
                button.textContent = segment.label;
                button.title = segment.path;
                button.addEventListener('click', () => navigateToDirectoryPath(segment.path));
                wrapper.appendChild(button);
            } else {
                const text = document.createElement('span');
                text.className = 'directory-path-text';
                text.textContent = segment.label;
                text.title = segment.path;
                wrapper.appendChild(text);
            }
        });

        return wrapper;
    }

    function encodeRelativePath(path) {
        return String(path || '')
            .split('/')
            .map(segment => encodeURIComponent(segment))
            .join('/');
    }

    function buildDirectoryBrowserItems(note) {
        if (!note) {
            return [];
        }
        const childDirs = Array.isArray(note.child_directories) ? note.child_directories : [];
        const files = Array.isArray(note.file_details)
            ? note.file_details
            : (Array.isArray(note.files) ? note.files.map(name => ({ name })) : []);

        return childDirs.map(dir => ({
            kind: 'directory',
            name: dir.name || dir.path || '폴더',
            path: dir.path || dir.name || '',
            modified: dir.modified || '',
            meta: [
                `파일 ${Number(dir.file_count || 0).toLocaleString()}개`,
                `디렉토리 ${Number(dir.directory_count || 0).toLocaleString()}개`,
                dir.total_size_human || '0 B'
            ].join(' · ')
        })).concat(files.map(file => ({
            kind: 'file',
            name: file.name || file.path || '파일',
            path: file.path || file.name || '',
            extension: file.extension || '',
            modified: file.modified || '',
            preview: file.preview || null,
            officeViewer: file.office_viewer || null,
            meta: [
                getFileKindLabel(file),
                file.size_human || '0 B'
            ].join(' · ')
        })));
    }

    function getFileTypeByExtension(ext) {
        const normalized = String(ext || '').toLowerCase();
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

    function getItemUrl(item) {
        if (!item || !item.path) {
            return '';
        }
        return encodeRelativePath(item.path);
    }

    function getFileKindLabel(item) {
        if (!item || item.kind === 'directory') {
            return '폴더';
        }
        const ext = String(item.extension || '').toUpperCase();
        return ext ? `${ext} 파일` : '파일';
    }

    function getStoredDirectoryViewMode() {
        try {
            const value = window.localStorage.getItem(DIRECTORY_VIEW_STORAGE_KEY);
            return directoryViewModes.some(mode => mode.id === value) ? value : 'grid';
        } catch (error) {
            return 'grid';
        }
    }

    function setStoredDirectoryViewMode(value) {
        try {
            window.localStorage.setItem(DIRECTORY_VIEW_STORAGE_KEY, value);
        } catch (error) {
            // Storage is optional; the view still works without persistence.
        }
    }

    function getStoredPreviewVisible() {
        try {
            return window.localStorage.getItem(DIRECTORY_PREVIEW_STORAGE_KEY) !== 'false';
        } catch (error) {
            return true;
        }
    }

    function setStoredPreviewVisible(value) {
        try {
            window.localStorage.setItem(DIRECTORY_PREVIEW_STORAGE_KEY, value ? 'true' : 'false');
        } catch (error) {
            // Storage is optional; the view still works without persistence.
        }
    }

    function getStoredDirectoryListWidth() {
        try {
            const value = Number(window.localStorage.getItem(DIRECTORY_SPLIT_STORAGE_KEY));
            return Number.isFinite(value) && value > 0 ? value : 0;
        } catch (error) {
            return 0;
        }
    }

    function setStoredDirectoryListWidth(value) {
        try {
            if (Number(value) > 0) {
                window.localStorage.setItem(DIRECTORY_SPLIT_STORAGE_KEY, String(Math.round(value)));
            } else {
                window.localStorage.removeItem(DIRECTORY_SPLIT_STORAGE_KEY);
            }
        } catch (error) {
            // Storage is optional; the view still works without persistence.
        }
    }

    function getStoredGalleryPreviewHeight() {
        try {
            const value = Number(window.localStorage.getItem(DIRECTORY_GALLERY_SPLIT_STORAGE_KEY));
            return Number.isFinite(value) && value > 0 ? value : 0;
        } catch (error) {
            return 0;
        }
    }

    function setStoredGalleryPreviewHeight(value) {
        try {
            window.localStorage.setItem(DIRECTORY_GALLERY_SPLIT_STORAGE_KEY, String(Math.round(value)));
        } catch (error) {
            // Storage is optional; the view still works without persistence.
        }
    }

    function getStoredGalleryInfoWidth() {
        try {
            const value = Number(window.localStorage.getItem(DIRECTORY_GALLERY_INFO_SPLIT_STORAGE_KEY));
            return Number.isFinite(value) && value > 0 ? value : 0;
        } catch (error) {
            return 0;
        }
    }

    function setStoredGalleryInfoWidth(value) {
        try {
            window.localStorage.setItem(DIRECTORY_GALLERY_INFO_SPLIT_STORAGE_KEY, String(Math.round(value)));
        } catch (error) {
            // Storage is optional; the view still works without persistence.
        }
    }

    function setDirectoryViewMode(section, mode, controls, previewToggleButton, options = {}) {
        section.dataset.viewMode = mode;
        setStoredDirectoryViewMode(mode);
        if (mode !== 'gallery') {
            section.style.removeProperty('--directory-list-width');
            setStoredDirectoryListWidth(0);
        }
        if (mode === 'columns') {
            renderDirectoryColumns(section, undefined, { skipHistory: true });
        } else {
            renderDirectoryFlatItems(section, { skipHistory: true });
        }
        if (previewToggleButton) {
            previewToggleButton.title = mode === 'gallery' ? '파일정보 토글' : '미리보기 토글';
            previewToggleButton.setAttribute('aria-label', mode === 'gallery' ? '파일정보 토글' : '미리보기 토글');
            previewToggleButton.setAttribute('aria-pressed', section.dataset.previewVisible === 'true' ? 'true' : 'false');
        }
        if (controls) {
            controls.querySelectorAll('.view-mode-button').forEach(button => {
                button.setAttribute('aria-pressed', button.dataset.viewMode === mode ? 'true' : 'false');
            });
        }
        requestAnimationFrame(() => focusDirectoryBrowser(section));
        if (!options.skipHistory) {
            recordDirectoryHistory('view-mode');
        }
    }

    function setupDirectorySplitter(section, splitter) {
        if (!section || !splitter) {
            return;
        }

        const applyListWidth = (width, shouldStore) => {
            const layout = section.querySelector('.directory-browser-layout');
            if (!layout) {
                return;
            }
            const rect = layout.getBoundingClientRect();
            const splitterWidth = splitter.getBoundingClientRect().width || 8;
            const minList = 220;
            const minPreview = 280;
            const maxList = Math.max(minList, rect.width - splitterWidth - minPreview);
            const nextWidth = Math.min(Math.max(width, minList), maxList);
            section.style.setProperty('--directory-list-width', `${Math.round(nextWidth)}px`);
            if (shouldStore) {
                setStoredDirectoryListWidth(nextWidth);
            }
        };
        const setListWidth = (clientX, shouldStore) => {
            const layout = section.querySelector('.directory-browser-layout');
            if (!layout) {
                return;
            }
            const rect = layout.getBoundingClientRect();
            applyListWidth(clientX - rect.left, shouldStore);
        };
        const applyGalleryPreviewHeight = (height, shouldStore) => {
            const layout = section.querySelector('.directory-browser-layout');
            if (!layout) {
                return;
            }
            const rect = layout.getBoundingClientRect();
            const splitterHeight = splitter.getBoundingClientRect().height || 8;
            const minPreview = 260;
            const minList = 96;
            const maxPreview = Math.max(minPreview, rect.height - splitterHeight - minList);
            const nextHeight = Math.min(Math.max(height, minPreview), maxPreview);
            section.style.setProperty('--directory-gallery-preview-height', `${Math.round(nextHeight)}px`);
            if (shouldStore) {
                setStoredGalleryPreviewHeight(nextHeight);
            }
        };
        const setGalleryPreviewHeight = (clientY, shouldStore) => {
            const layout = section.querySelector('.directory-browser-layout');
            if (!layout) {
                return;
            }
            const rect = layout.getBoundingClientRect();
            applyGalleryPreviewHeight(clientY - rect.top, shouldStore);
        };

        setStoredDirectoryListWidth(0);
        const storedGalleryHeight = getStoredGalleryPreviewHeight();
        if (storedGalleryHeight) {
            requestAnimationFrame(() => applyGalleryPreviewHeight(storedGalleryHeight, false));
        }

        splitter.addEventListener('pointerdown', (event) => {
            const isGallery = section.dataset.viewMode === 'gallery';
            if (!isGallery && section.dataset.previewVisible !== 'true') {
                return;
            }
            event.preventDefault();
            splitter.setPointerCapture(event.pointerId);
            section.classList.add('is-resizing');

            const handleMove = (moveEvent) => {
                if (isGallery) {
                    setGalleryPreviewHeight(moveEvent.clientY, false);
                } else {
                    setListWidth(moveEvent.clientX, false);
                }
            };
            const handleEnd = (endEvent) => {
                if (isGallery) {
                    setGalleryPreviewHeight(endEvent.clientY, true);
                } else {
                    setListWidth(endEvent.clientX, false);
                }
                section.classList.remove('is-resizing');
                try {
                    splitter.releasePointerCapture(event.pointerId);
                } catch (error) {
                    // Pointer capture may already be released by the browser.
                }
                splitter.removeEventListener('pointermove', handleMove);
                splitter.removeEventListener('pointerup', handleEnd);
                splitter.removeEventListener('pointercancel', handleEnd);
            };

            splitter.addEventListener('pointermove', handleMove);
            splitter.addEventListener('pointerup', handleEnd);
            splitter.addEventListener('pointercancel', handleEnd);
        });

        splitter.addEventListener('dblclick', () => {
            if (section.dataset.viewMode === 'gallery') {
                section.style.removeProperty('--directory-gallery-preview-height');
                setStoredGalleryPreviewHeight(0);
            } else {
                section.style.removeProperty('--directory-list-width');
                setStoredDirectoryListWidth(0);
            }
        });
    }

    function setupGalleryInfoSplitter(section, preview) {
        if (!section || !preview || section.dataset.viewMode !== 'gallery') {
            return;
        }
        const splitter = preview.querySelector('.directory-gallery-info-splitter');
        if (!splitter) {
            return;
        }

        const applyInfoWidth = (width, shouldStore) => {
            const rect = preview.getBoundingClientRect();
            const splitterWidth = splitter.getBoundingClientRect().width || 8;
            const minVisual = 320;
            const minInfo = 240;
            const maxInfo = Math.max(minInfo, rect.width - splitterWidth - minVisual);
            const nextWidth = Math.min(Math.max(width, minInfo), maxInfo);
            section.style.setProperty('--directory-gallery-info-width', `${Math.round(nextWidth)}px`);
            if (shouldStore) {
                setStoredGalleryInfoWidth(nextWidth);
            }
        };
        const setInfoWidth = (clientX, shouldStore) => {
            const rect = preview.getBoundingClientRect();
            applyInfoWidth(rect.right - clientX, shouldStore);
        };

        const storedWidth = getStoredGalleryInfoWidth();
        if (storedWidth) {
            requestAnimationFrame(() => applyInfoWidth(storedWidth, false));
        }

        splitter.addEventListener('pointerdown', (event) => {
            if (section.dataset.previewVisible !== 'true') {
                return;
            }
            event.preventDefault();
            splitter.setPointerCapture(event.pointerId);
            section.classList.add('is-resizing-gallery-info');

            const handleMove = (moveEvent) => {
                setInfoWidth(moveEvent.clientX, false);
            };
            const handleEnd = (endEvent) => {
                setInfoWidth(endEvent.clientX, true);
                section.classList.remove('is-resizing-gallery-info');
                try {
                    splitter.releasePointerCapture(event.pointerId);
                } catch (error) {
                    // Pointer capture may already be released by the browser.
                }
                splitter.removeEventListener('pointermove', handleMove);
                splitter.removeEventListener('pointerup', handleEnd);
                splitter.removeEventListener('pointercancel', handleEnd);
            };

            splitter.addEventListener('pointermove', handleMove);
            splitter.addEventListener('pointerup', handleEnd);
            splitter.addEventListener('pointercancel', handleEnd);
        });

        splitter.addEventListener('dblclick', () => {
            section.style.removeProperty('--directory-gallery-info-width');
            setStoredGalleryInfoWidth(0);
        });
    }

    function createDirectoryItemIcon(item, options = {}) {
        const isDirectory = item.kind === 'directory';
        if (isDirectory) {
            const icon = document.createElement('span');
            icon.className = 'directory-item-icon directory-folder-icon';
            icon.innerHTML = folderIconSvg;
            return icon;
        }

        const fileExt = String(item.extension || '').toLowerCase();
        const fileType = getFileTypeByExtension(fileExt);
        const fileUrl = getItemUrl(item);
        if (fileType === 'image' && fileUrl) {
            const frame = document.createElement('span');
            frame.className = 'directory-item-icon directory-image-thumb';
            const img = document.createElement('img');
            img.src = fileUrl;
            img.alt = '';
            img.loading = 'lazy';
            frame.appendChild(img);
            return frame;
        }
        if (fileType === 'video' && fileUrl) {
            const frame = document.createElement('span');
            frame.className = 'directory-item-icon directory-video-thumb';
            const video = document.createElement('video');
            video.src = fileUrl;
            video.muted = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.setAttribute('aria-hidden', 'true');
            frame.appendChild(video);

            const play = document.createElement('span');
            play.className = 'preview-play-overlay directory-item-play-overlay';
            play.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="currentColor" opacity="0.9"/><path d="M19 15l15 9-15 9z" fill="#fff"/></svg>';
            frame.appendChild(play);
            return frame;
        }
        if (fileType === 'audio' && fileUrl && options.allowRichPreview) {
            const frame = document.createElement('span');
            frame.className = 'directory-item-icon directory-audio-thumb';
            const badge = createFileBadge(fileType, fileExt);
            frame.appendChild(badge);

            const play = document.createElement('span');
            play.className = 'preview-play-overlay directory-item-play-overlay';
            play.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="currentColor" opacity="0.9"/><path d="M19 15l15 9-15 9z" fill="#fff"/></svg>';
            frame.appendChild(play);
            return frame;
        }
        if (fileUrl && options.allowRichPreview && iconPreviewExtensions.has(fileExt)) {
            const frame = document.createElement('span');
            frame.className = 'directory-item-icon directory-inline-thumb';
            frame.dataset.extension = fileExt || 'file';

            const iframe = document.createElement('iframe');
            iframe.src = fileUrl;
            iframe.loading = 'lazy';
            iframe.tabIndex = -1;
            iframe.setAttribute('aria-hidden', 'true');
            iframe.setAttribute('sandbox', '');
            frame.appendChild(iframe);

            const chip = document.createElement('span');
            chip.className = 'directory-inline-extension-chip';
            chip.textContent = (fileExt || 'file').toUpperCase();
            frame.appendChild(chip);
            return frame;
        }

        const icon = createFileBadge(fileType, fileExt);
        icon.classList.add('directory-item-icon');
        return icon;
    }

    function renderDirectoryPreview(item, options = {}) {
        const preview = document.createElement('aside');
        preview.className = 'directory-preview';

        if (!item) {
            preview.innerHTML = '<div class="directory-preview-empty">항목을 선택하면 미리보기가 표시됩니다.</div>';
            return preview;
        }

        const visual = document.createElement('div');
        visual.className = 'directory-preview-visual';
        const fileType = getFileTypeByExtension(item.extension);
        const fileUrl = getItemUrl(item);

        if (item.kind === 'directory') {
            visual.classList.add('directory-preview-visual--folder');
            visual.innerHTML = folderIconSvg;
        } else if (options.viewerMode) {
            visual.classList.add('directory-preview-visual--viewer');
            visual.appendChild(renderDirectoryViewerPane(item));
        } else if (fileType === 'image' && fileUrl) {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.alt = item.name || '';
            visual.appendChild(img);
        } else if (fileUrl && (iconPreviewExtensions.has(String(item.extension || '').toLowerCase()) || fileType === 'document')) {
            visual.classList.add('directory-preview-visual--viewer');
            visual.appendChild(renderDirectoryViewerPane(item));
        } else if (fileType === 'video' && fileUrl) {
            visual.classList.add('directory-preview-visual--playable');
            visual.appendChild(createFileBadge(fileType, item.extension));
            const play = document.createElement('span');
            play.className = 'preview-play-overlay';
            play.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="currentColor" opacity="0.9"/><path d="M19 15l15 9-15 9z" fill="#fff"/></svg>';
            visual.appendChild(play);
        } else if (fileType === 'audio' && fileUrl) {
            visual.classList.add('directory-preview-visual--playable');
            visual.appendChild(createFileBadge(fileType, item.extension));
            const play = document.createElement('span');
            play.className = 'preview-play-overlay';
            play.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="currentColor" opacity="0.9"/><path d="M19 15l15 9-15 9z" fill="#fff"/></svg>';
            visual.appendChild(play);
        } else {
            visual.appendChild(createFileBadge(fileType, item.extension));
        }

        const title = document.createElement('strong');
        title.className = 'directory-preview-name';
        title.textContent = item.name || '';

        const type = document.createElement('span');
        type.className = 'directory-preview-type';
        type.textContent = item.meta || getFileKindLabel(item);

        const info = document.createElement('dl');
        info.className = 'directory-preview-info';
        [
            ['종류', getFileKindLabel(item)],
            ['경로', item.path || ''],
            ['수정일', item.modified || '']
        ].filter(([, value]) => value).forEach(([label, value]) => {
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = value;
            info.appendChild(dt);
            info.appendChild(dd);
        });

        preview.appendChild(visual);
        if (options.viewerMode) {
            const splitter = document.createElement('div');
            splitter.className = 'directory-gallery-info-splitter';
            splitter.setAttribute('role', 'separator');
            splitter.setAttribute('aria-orientation', 'vertical');
            splitter.setAttribute('aria-label', '미리보기와 파일정보 영역 크기 조정');
            splitter.title = '드래그해서 파일정보 영역 크기 조정';
            preview.appendChild(splitter);
        }
        preview.appendChild(title);
        preview.appendChild(type);
        preview.appendChild(info);
        return preview;
    }

    function isInteractivePreviewTarget(target) {
        return Boolean(target.closest('button, a, iframe, video, audio, pre, textarea, input, select, .markdown-source-viewer'));
    }

    function playItemInPreview(section, item) {
        const previewMount = section && section.querySelector('.directory-preview-mount');
        const visual = previewMount && previewMount.querySelector('.directory-preview-visual');
        if (!visual || !item) {
            return;
        }

        const fileUrl = getItemUrl(item);
        const fileType = getFileTypeByExtension(item.extension);
        if (fileType !== 'video' && fileType !== 'audio') {
            openDirectoryViewer(section, item);
            return;
        }

        visual.innerHTML = '';
        visual.classList.add('directory-preview-visual--playing');
        if (fileType === 'video') {
            const video = document.createElement('video');
            video.src = fileUrl;
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            visual.appendChild(video);
        } else {
            const audio = document.createElement('audio');
            audio.src = fileUrl;
            audio.controls = true;
            audio.autoplay = true;
            visual.appendChild(audio);
        }
    }

    function updateDirectoryPreview(section, item, options = {}) {
        section._selectedDirectoryItem = item;
        section.querySelectorAll('.directory-item').forEach(node => {
            const isSelected = node._directoryItem === item
                || (node._directoryItem && item && node._directoryItem.path === item.path);
            node.classList.toggle('is-selected', isSelected);
            node.tabIndex = isSelected ? 0 : -1;
        });

        const previewMount = section.querySelector('.directory-preview-mount');
        if (!previewMount) {
            return;
        }
        previewMount.innerHTML = '';
        previewMount.appendChild(renderDirectoryPreview(item, {
            viewerMode: section.dataset.viewMode === 'gallery'
        }));
        const preview = previewMount.querySelector('.directory-preview');
        setupGalleryInfoSplitter(section, preview);
        if (preview && item && item.kind === 'file' && section.dataset.viewMode !== 'gallery') {
            preview.tabIndex = 0;
            preview.setAttribute('role', 'button');
            preview.title = getFileTypeByExtension(item.extension) === 'video' || getFileTypeByExtension(item.extension) === 'audio'
                ? '재생'
                : '뷰어 열기';
            preview.addEventListener('click', (event) => {
                if (isInteractivePreviewTarget(event.target)) {
                    return;
                }
                playItemInPreview(section, item);
            });
            preview.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    playItemInPreview(section, item);
                }
            });
        }
        if (preview && item && item.kind === 'file' && section.dataset.viewMode === 'gallery' && getFileTypeByExtension(item.extension) === 'image') {
            const visual = preview.querySelector('.directory-preview-visual');
            if (visual) {
                visual.tabIndex = 0;
                visual.setAttribute('role', 'button');
                visual.title = '뷰어 열기';
                visual.addEventListener('click', () => openDirectoryViewer(section, item));
                visual.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDirectoryViewer(section, item);
                    }
                });
            }
        }

        const selectedNode = Array.from(section.querySelectorAll('.directory-item'))
            .find(node => node._directoryItem === item);
        if (selectedNode) {
            selectedNode.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            if (options.focus) {
                selectedNode.focus({ preventScroll: true });
            }
        }
        if (!options.skipHistory) {
            if (options.debounceHistory) {
                scheduleDirectoryHistory('select');
            } else {
                recordDirectoryHistory('select');
            }
        }
    }

    function closeDirectoryActionMenu() {
        const currentMenu = document.querySelector('.directory-action-menu');
        if (currentMenu) {
            currentMenu.remove();
        }
    }

    function viewDirectoryItem(item) {
        if (!item) {
            return;
        }

        if (item.kind === 'directory') {
            const noteIndex = getDirectoryNoteIndex(item.path);
            if (noteIndex >= 0) {
                showFileContent(noteIndex);
            }
            return;
        }

        const fileUrl = getItemUrl(item);
        const fileExt = String(item.extension || '').toLowerCase();
        const fileType = getFileTypeByExtension(fileExt);

        if (fileType === 'image') {
            modalTitle.textContent = item.name || 'Image';
            modalBody.innerHTML = '';
            const img = document.createElement('img');
            img.src = fileUrl;
            img.alt = item.name || '';
            img.style.maxWidth = '100%';
            img.style.maxHeight = '80vh';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            modalBody.appendChild(img);
            openModal();
            return;
        }

        if (fileType === 'video') {
            modalTitle.textContent = item.name || 'Video';
            modalBody.innerHTML = '';
            const video = document.createElement('video');
            video.src = fileUrl;
            video.controls = true;
            video.autoplay = true;
            video.playsInline = true;
            video.style.width = '100%';
            video.style.maxHeight = '80vh';
            modalBody.appendChild(video);
            openModal();
            return;
        }

        if (fileType === 'audio') {
            playAudioInModal(fileUrl, item.name || 'audio');
            return;
        }

        if (fileType === 'document') {
            viewDocumentInModal(fileUrl, fileExt, item.name || 'document');
            return;
        }

        window.open(fileUrl, '_blank', 'noopener');
    }

    function renderDirectoryViewerPane(item) {
        const pane = document.createElement('div');
        pane.className = 'directory-viewer-pane';
        const fileUrl = getItemUrl(item);
        const fileExt = String(item && item.extension || '').toLowerCase();
        const fileType = getFileTypeByExtension(fileExt);

        if (fileExt === 'md') {
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

            return pane;
        }

        if (window.DocumentViewer && window.DocumentViewer.render(pane, fileUrl, fileExt, item.name || '', item)) {
                return pane;
        }

        if (fileType === 'image') {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.alt = item.name || '';
            pane.appendChild(img);
            return pane;
        }

        if (fileType === 'video') {
            const video = document.createElement('video');
            video.src = fileUrl;
            video.controls = true;
            video.playsInline = true;
            pane.appendChild(video);
            return pane;
        }

        if (fileType === 'audio') {
            const audio = document.createElement('audio');
            audio.src = fileUrl;
            audio.controls = true;
            pane.appendChild(audio);
            return pane;
        }

        if (fileType === 'document') {
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
        fallback.appendChild(createFileBadge(fileType, fileExt));
        const link = document.createElement('a');
        link.href = fileUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '새 창에서 열기';
        fallback.appendChild(link);
        pane.appendChild(fallback);
        return pane;
    }

    function openDirectoryViewer(section, selectedItem, options = {}) {
        let items = (section && Array.isArray(section._directoryItems) ? section._directoryItems : [])
            .filter(item => item.kind === 'file');
        if (selectedItem && !items.some(item => item.path === selectedItem.path)) {
            const ownerNote = notes.find(note => buildDirectoryBrowserItems(note).some(item => item.path === selectedItem.path));
            if (ownerNote) {
                items = buildDirectoryBrowserItems(ownerNote).filter(item => item.kind === 'file');
            }
        }
        if (!items.length || !selectedItem) {
            viewDirectoryItem(selectedItem);
            return;
        }

        let selectedIndex = Math.max(0, items.findIndex(item => item.path === selectedItem.path));
        modalTitle.textContent = selectedItem.name || 'Viewer';
        modalBody.innerHTML = '';

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

        const render = () => {
            const item = items[selectedIndex];
            modalTitle.textContent = item.name || 'Viewer';
            counter.textContent = `${selectedIndex + 1} / ${items.length}`;
            prevButton.disabled = selectedIndex <= 0;
            nextButton.disabled = selectedIndex >= items.length - 1;
            content.innerHTML = '';
            content.appendChild(renderDirectoryViewerPane(item));
            rail.querySelectorAll('.directory-viewer-thumb').forEach((thumb, index) => {
                thumb.classList.toggle('is-selected', index === selectedIndex);
                if (index === selectedIndex) {
                    thumb.scrollIntoView({ block: 'nearest' });
                }
            });
            updateDirectoryPreview(section, item, { skipHistory: true });
            if (!options.skipHistory) {
                scheduleDirectoryHistory('viewer', { viewerItem: item, delay: 150 });
            }
        };

        items.forEach((item, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'directory-viewer-thumb';
            button.appendChild(createDirectoryItemIcon(item));
            const label = document.createElement('span');
            label.textContent = item.name || '';
            button.appendChild(label);
            button.addEventListener('click', () => {
                selectedIndex = index;
                render();
                button.focus({ preventScroll: true });
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    selectedIndex = Math.max(0, index - 1);
                    render();
                    const target = rail.querySelectorAll('.directory-viewer-thumb')[selectedIndex];
                    if (target) target.focus({ preventScroll: true });
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    selectedIndex = Math.min(items.length - 1, index + 1);
                    render();
                    const target = rail.querySelectorAll('.directory-viewer-thumb')[selectedIndex];
                    if (target) target.focus({ preventScroll: true });
                } else if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectedIndex = index;
                    render();
                }
            });
            rail.appendChild(button);
        });

        prevButton.addEventListener('click', () => {
            if (selectedIndex > 0) {
                selectedIndex -= 1;
                render();
            }
        });
        nextButton.addEventListener('click', () => {
            if (selectedIndex < items.length - 1) {
                selectedIndex += 1;
                render();
            }
        });
        viewer.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft' && selectedIndex > 0) {
                event.preventDefault();
                selectedIndex -= 1;
                render();
            }
            if (event.key === 'ArrowRight' && selectedIndex < items.length - 1) {
                event.preventDefault();
                selectedIndex += 1;
                render();
            }
        });

        main.appendChild(nav);
        main.appendChild(content);
        viewer.appendChild(main);
        viewer.appendChild(rail);
        modalBody.appendChild(viewer);
        render();
        openModal();
        viewer.focus();
    }

    function openDirectoryActionMenu(section, item, anchor) {
        closeDirectoryActionMenu();
        if (!item || item.kind === 'directory') {
            return;
        }

        const menu = document.createElement('div');
        menu.className = 'directory-action-menu';
        menu.setAttribute('role', 'menu');

        const viewerButton = document.createElement('button');
        viewerButton.type = 'button';
        viewerButton.setAttribute('role', 'menuitem');
        viewerButton.textContent = '뷰어';
        viewerButton.addEventListener('click', (event) => {
            event.stopPropagation();
            openDirectoryViewer(section, item);
            closeDirectoryActionMenu();
        });

        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.setAttribute('role', 'menuitem');
        openButton.textContent = '열기';
        openButton.addEventListener('click', (event) => {
            event.stopPropagation();
            window.open(getItemUrl(item), '_blank', 'noopener');
            closeDirectoryActionMenu();
        });

        menu.appendChild(viewerButton);
        menu.appendChild(openButton);
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
                closeDirectoryActionMenu();
                if (anchor && typeof anchor.focus === 'function') {
                    anchor.focus({ preventScroll: true });
                }
            }
        });
        menu.addEventListener('click', event => event.stopPropagation());
        document.body.appendChild(menu);

        const rect = anchor.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const left = Math.min(rect.left, window.innerWidth - menuRect.width - 12);
        const top = Math.min(rect.bottom + 6, window.innerHeight - menuRect.height - 12);
        menu.style.left = `${Math.max(12, left)}px`;
        menu.style.top = `${Math.max(12, top)}px`;
        requestAnimationFrame(() => viewerButton.focus({ preventScroll: true }));
    }

    function getDirectoryGridColumnCount(section) {
        const viewMode = section && section.dataset.viewMode;
        if (viewMode !== 'grid') {
            return 1;
        }

        const list = section.querySelector('.directory-items');
        if (!list) {
            return 1;
        }
        const columns = window.getComputedStyle(list).gridTemplateColumns;
        if (columns && columns !== 'none') {
            const count = columns.split(' ').filter(Boolean).length;
            if (count > 0) {
                return count;
            }
        }
        const firstItem = list.querySelector('.directory-item');
        if (!firstItem) {
            return 1;
        }
        const itemWidth = firstItem.getBoundingClientRect().width || 1;
        const listWidth = list.getBoundingClientRect().width || itemWidth;
        return Math.max(1, Math.floor(listWidth / itemWidth));
    }

    function moveDirectorySelection(section, currentItem, delta) {
        const currentNode = getSelectedDirectoryItemNode(section);
        const currentColumn = section && section.dataset.viewMode === 'columns'
            ? currentNode && currentNode.closest('.directory-column')
            : null;
        const itemNodes = Array.from((currentColumn || section).querySelectorAll('.directory-item'));
        if (!itemNodes.length) {
            return;
        }
        const currentIndex = Math.max(0, itemNodes.findIndex(node => node === currentNode || node._directoryItem === currentItem));
        const nextIndex = Math.max(0, Math.min(itemNodes.length - 1, currentIndex + delta));
        const nextNode = itemNodes[nextIndex];
        if (!nextNode || nextNode === itemNodes[currentIndex]) {
            return;
        }
        closeDirectoryActionMenu();
        updateDirectoryPreview(section, nextNode._directoryItem, { focus: true, debounceHistory: true });
    }

    function renderDirectoryFlatItems(section, options = {}) {
        const list = section && section.querySelector('.directory-items');
        if (!list || !Array.isArray(section._directoryItems)) {
            return;
        }
        list.innerHTML = '';
        const highlightKeywords = currentTitleOnly ? [] : currentHighlightKeywords;
        section._directoryItems.forEach(item => {
            list.appendChild(createDirectoryBrowserItem(item, highlightKeywords, section));
        });
        updateDirectoryPreview(section, section._selectedDirectoryItem || section._directoryItems[0], {
            skipHistory: options.skipHistory
        });
    }

    function createDirectoryColumnItem(item, section, columnIndex, pathChain) {
        const element = createDirectoryBrowserItem(item, currentTitleOnly ? [] : currentHighlightKeywords, section);
        element.classList.add('directory-column-item');
        element.dataset.columnIndex = String(columnIndex);

        if (item.kind === 'directory') {
            const chevron = document.createElement('span');
            chevron.className = 'directory-column-chevron';
            chevron.textContent = '›';
            element.appendChild(chevron);

            element.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                closeDirectoryActionMenu();
                updateDirectoryPreview(section, item);
                renderDirectoryColumns(section, pathChain.concat(item.path), { skipHistory: true });
                requestAnimationFrame(() => focusDirectoryBrowser(section));
            }, true);
        } else {
            element.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                updateDirectoryPreview(section, item);
                openDirectoryActionMenu(section, item, element);
            }, true);
        }

        return element;
    }

    function renderDirectoryColumns(section, selectedPathChain, options = {}) {
        const list = section && section.querySelector('.directory-items');
        if (!list || !section._directoryNote) {
            return;
        }

        const basePath = section._directoryNote.directory_path || '.';
        const chain = Array.isArray(selectedPathChain) && selectedPathChain.length
            ? selectedPathChain
            : [basePath];
        const normalizedChain = chain[0] === basePath ? chain : [basePath].concat(chain);

        list.innerHTML = '';
        normalizedChain.forEach((path, columnIndex) => {
            const note = getDirectoryNoteByPath(path);
            if (!note) {
                return;
            }
            const column = document.createElement('div');
            column.className = 'directory-column';
            column.dataset.path = path;
            const columnItems = buildDirectoryBrowserItems(note);
            columnItems.forEach(item => {
                column.appendChild(createDirectoryColumnItem(item, section, columnIndex, normalizedChain.slice(0, columnIndex + 1)));
            });
            list.appendChild(column);

            const selectedNextPath = normalizedChain[columnIndex + 1];
            if (selectedNextPath) {
                const selectedNode = Array.from(column.querySelectorAll('.directory-item'))
                    .find(node => node._directoryItem && node._directoryItem.path === selectedNextPath);
                if (selectedNode) {
                    selectedNode.classList.add('is-selected');
                }
            }
        });

        const activePath = normalizedChain[normalizedChain.length - 1];
        const activeItem = section._selectedDirectoryItem;
        if (activeItem) {
            const activeNode = Array.from(list.querySelectorAll('.directory-item'))
                .find(node => node._directoryItem === activeItem || (node._directoryItem && node._directoryItem.path === activeItem.path));
            if (activeNode) {
                activeNode.classList.add('is-selected');
                activeNode.tabIndex = 0;
            }
        } else {
            const activeNote = getDirectoryNoteByPath(activePath);
            const firstItem = buildDirectoryBrowserItems(activeNote)[0];
            if (firstItem) {
                updateDirectoryPreview(section, firstItem, { skipHistory: options.skipHistory });
            }
        }

        const lastColumn = list.lastElementChild;
        if (lastColumn) {
            lastColumn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        }
    }

    function getSelectedDirectoryItemNode(section) {
        if (section && section.dataset.viewMode === 'columns') {
            const selectedNodes = Array.from(section.querySelectorAll('.directory-item.is-selected'));
            if (selectedNodes.length) {
                const focusedSelected = selectedNodes.find(node => node === document.activeElement);
                return focusedSelected || selectedNodes[selectedNodes.length - 1];
            }
        }
        return section.querySelector('.directory-item.is-selected') || section.querySelector('.directory-item');
    }

    function focusDirectoryBrowser(section) {
        if (!section || !document.body.contains(section)) {
            return;
        }
        const selectedNode = getSelectedDirectoryItemNode(section);
        if (selectedNode) {
            selectedNode.focus({ preventScroll: true });
        }
    }

    function handleDirectoryItemKeydown(event, section, item, anchor) {
        const selectedNode = getSelectedDirectoryItemNode(section);
        const activeItem = item || (selectedNode && selectedNode._directoryItem);
        if (!activeItem) {
            return;
        }

        const viewMode = section && section.dataset.viewMode;
        const columns = getDirectoryGridColumnCount(section);
        let delta = 0;

        if (viewMode === 'columns' && event.key === 'ArrowRight' && activeItem.kind === 'directory') {
            event.preventDefault();
            const column = (anchor || selectedNode) && (anchor || selectedNode).closest('.directory-column');
            const allColumns = Array.from(section.querySelectorAll('.directory-column'));
            const columnIndex = Math.max(0, allColumns.indexOf(column));
            const pathChain = allColumns.slice(0, columnIndex + 1)
                .map(node => node.dataset.path)
                .filter(Boolean);
            closeDirectoryActionMenu();
            updateDirectoryPreview(section, activeItem);
            renderDirectoryColumns(section, pathChain.concat(activeItem.path), { skipHistory: true });
            const nextColumn = section.querySelectorAll('.directory-column')[columnIndex + 1];
            const nextItem = nextColumn && nextColumn.querySelector('.directory-item');
            if (nextItem) {
                nextItem.focus({ preventScroll: true });
            }
            return;
        }

        if (event.key === 'ArrowLeft') {
            delta = -1;
        } else if (event.key === 'ArrowRight') {
            delta = 1;
        } else if (event.key === 'ArrowUp') {
            delta = viewMode === 'grid' ? -columns : -1;
        } else if (event.key === 'ArrowDown') {
            delta = viewMode === 'grid' ? columns : 1;
        } else if (event.key === 'Home') {
            const nodes = Array.from(section.querySelectorAll('.directory-item'));
            if (nodes.length) {
                event.preventDefault();
                closeDirectoryActionMenu();
                updateDirectoryPreview(section, nodes[0]._directoryItem, { focus: true, debounceHistory: true });
            }
            return;
        } else if (event.key === 'End') {
            const nodes = Array.from(section.querySelectorAll('.directory-item'));
            if (nodes.length) {
                event.preventDefault();
                closeDirectoryActionMenu();
                updateDirectoryPreview(section, nodes[nodes.length - 1]._directoryItem, { focus: true, debounceHistory: true });
            }
            return;
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (activeItem.kind === 'directory') {
                const noteIndex = getDirectoryNoteIndex(activeItem.path);
                if (noteIndex >= 0) {
                    showFileContent(noteIndex);
                }
            } else {
                openDirectoryActionMenu(section, activeItem, anchor || selectedNode || event.currentTarget);
            }
            return;
        } else {
            return;
        }

        event.preventDefault();
        moveDirectorySelection(section, activeItem, delta);
    }

    function createDirectoryBrowserItem(item, highlightKeywords, section) {
        const isDirectory = item.kind === 'directory';
        const element = document.createElement(isDirectory ? 'button' : 'a');
        element.className = 'directory-item';
        element.dataset.kind = item.kind;
        element._directoryItem = item;
        element.tabIndex = -1;
        element.addEventListener('keydown', (event) => handleDirectoryItemKeydown(event, section, item, element));

        if (isDirectory) {
            element.type = 'button';
            element.addEventListener('click', (event) => {
                event.preventDefault();
                closeDirectoryActionMenu();
                updateDirectoryPreview(section, item);
            });
            element.addEventListener('dblclick', () => {
                const noteIndex = getDirectoryNoteIndex(item.path);
                if (noteIndex >= 0) {
                    showFileContent(noteIndex);
                }
            });
        } else {
            element.href = getItemUrl(item);
            element.target = '_blank';
            element.rel = 'noopener';
            element.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                updateDirectoryPreview(section, item);
                openDirectoryActionMenu(section, item, element);
            });
        }

        const icon = createDirectoryItemIcon(item, {
            allowRichPreview: section && (section.dataset.viewMode === 'grid' || section.dataset.viewMode === 'gallery')
        });

        const main = document.createElement('span');
        main.className = 'directory-item-main';

        const name = document.createElement('span');
        name.className = 'directory-item-name';
        name.innerHTML = highlightText(item.name, highlightKeywords);

        const meta = document.createElement('span');
        meta.className = 'directory-item-meta';
        meta.textContent = item.meta;

        main.appendChild(name);
        main.appendChild(meta);
        element.appendChild(icon);
        element.appendChild(main);

        return element;
    }

    function renderDirectoryBrowser(note) {
        const childDirs = Array.isArray(note.child_directories) ? note.child_directories : [];
        const files = Array.isArray(note.file_details) ? note.file_details : [];
        if (childDirs.length === 0 && files.length === 0) {
            return null;
        }

        const items = buildDirectoryBrowserItems(note);

        const section = document.createElement('section');
        section.className = 'directory-browser';
        const initialViewMode = getStoredDirectoryViewMode();
        const initialPreviewVisible = getStoredPreviewVisible();
        section.dataset.viewMode = initialViewMode;
        section.dataset.previewVisible = initialPreviewVisible ? 'true' : 'false';
        section.dataset.infoVisible = 'true';
        section._directoryItems = items;
        section._directoryNote = note;

        const toolbar = document.createElement('div');
        toolbar.className = 'directory-browser-toolbar';

        const title = document.createElement('div');
        title.className = 'directory-browser-title';
        const titleMeta = document.createElement('span');
        titleMeta.className = 'directory-browser-meta';
        titleMeta.appendChild(renderDirectoryPathLinks(note.directory_path || '.'));
        const countText = document.createElement('span');
        countText.className = 'directory-item-count';
        countText.textContent = ` · ${items.length.toLocaleString()}개`;
        titleMeta.appendChild(countText);
        title.appendChild(titleMeta);

        const controls = document.createElement('div');
        controls.className = 'view-mode-control';
        controls.setAttribute('aria-label', '파일 보기 모드');

        directoryViewModes.forEach(mode => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'view-mode-button';
            button.dataset.viewMode = mode.id;
            button.innerHTML = directoryViewIcons[mode.id];
            button.title = mode.label;
            button.setAttribute('aria-label', mode.label);
            button.setAttribute('aria-pressed', mode.id === initialViewMode ? 'true' : 'false');
            button.addEventListener('click', () => {
                closeDirectoryActionMenu();
                setDirectoryViewMode(section, mode.id, controls, previewToggleButton);
            });
            controls.appendChild(button);
        });

        toolbar.appendChild(title);
        const toolbarActions = document.createElement('div');
        toolbarActions.className = 'directory-browser-actions';
        const previewToggleButton = document.createElement('button');
        previewToggleButton.type = 'button';
        previewToggleButton.className = 'preview-toggle-button';
        previewToggleButton.innerHTML = previewToggleIcon;
        previewToggleButton.title = initialViewMode === 'gallery' ? '파일정보 토글' : '미리보기 토글';
        previewToggleButton.setAttribute('aria-label', initialViewMode === 'gallery' ? '파일정보 토글' : '미리보기 토글');
        previewToggleButton.setAttribute('aria-pressed', initialPreviewVisible ? 'true' : 'false');
        previewToggleButton.addEventListener('click', () => {
            closeDirectoryActionMenu();
            const nextVisible = section.dataset.previewVisible !== 'true';
            section.dataset.previewVisible = nextVisible ? 'true' : 'false';
            setStoredPreviewVisible(nextVisible);
            previewToggleButton.setAttribute('aria-pressed', nextVisible ? 'true' : 'false');
            recordDirectoryHistory('preview-toggle');
        });
        toolbarActions.appendChild(previewToggleButton);
        toolbarActions.appendChild(controls);
        const shareSection = createShareSection(getShareTitle(note), buildShareLinkForNote(note));
        if (shareSection) {
            shareSection.classList.add('share-section--toolbar');
            toolbarActions.appendChild(shareSection);
        }
        toolbar.appendChild(toolbarActions);

        const list = document.createElement('div');
        list.className = 'directory-items';
        list.tabIndex = 0;
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', '파일 탐색 목록');
        list.addEventListener('keydown', (event) => {
            if (event.target === list) {
                handleDirectoryItemKeydown(event, section, section._selectedDirectoryItem, getSelectedDirectoryItemNode(section));
            }
        });
        list.addEventListener('focus', () => {
            const selectedNode = getSelectedDirectoryItemNode(section);
            if (selectedNode) {
                selectedNode.focus({ preventScroll: true });
            }
        });
        if (initialViewMode !== 'columns') {
            const highlightKeywords = currentTitleOnly ? [] : currentHighlightKeywords;
            items.forEach(item => {
                list.appendChild(createDirectoryBrowserItem(item, highlightKeywords, section));
            });
        }

        const previewMount = document.createElement('div');
        previewMount.className = 'directory-preview-mount';
        previewMount.appendChild(renderDirectoryPreview(items[0]));

        const splitter = document.createElement('div');
        splitter.className = 'directory-splitter';
        splitter.setAttribute('role', 'separator');
        splitter.setAttribute('aria-orientation', 'vertical');
        splitter.setAttribute('aria-label', '파일 목록과 미리보기 영역 크기 조정');
        splitter.title = '드래그해서 영역 크기 조정';

        const layout = document.createElement('div');
        layout.className = 'directory-browser-layout';
        layout.appendChild(list);
        layout.appendChild(splitter);
        layout.appendChild(previewMount);

        section.appendChild(toolbar);
        section.appendChild(layout);
        setupDirectorySplitter(section, splitter);
        if (initialViewMode === 'columns') {
            renderDirectoryColumns(section, undefined, { skipHistory: true });
        } else {
            updateDirectoryPreview(section, items[0], { skipHistory: true });
        }
        return section;
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

    function renderMarkdownViewer(container, url) {
        const viewer = document.createElement('article');
        viewer.className = 'markdown-viewer';
        viewer.textContent = '문서를 불러오는 중입니다.';
        container.appendChild(viewer);

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.text();
            })
            .then(text => {
                viewer.innerHTML = markdownToHtml(text, url);
            })
            .catch(() => {
                viewer.textContent = 'Markdown 문서를 불러오지 못했습니다.';
            });
    }

    function updateCurrentNoteHeader(note) {
        const titleEl = document.getElementById('current-note-title');
        if (!titleEl) {
            return;
        }
        const displayTitle = buildNoteDisplayTitle(note);
        titleEl.textContent = displayTitle;
        titleEl.title = displayTitle;
    }

    function updateSelectedListHighlight(shouldScroll = false) {
        const lists = [
            document.getElementById('mainDirectories'),
            document.getElementById('files')
        ].filter(Boolean);
        if (!lists.length) {
            return;
        }
        const listContainer = document.getElementById('file-list') || lists[0].parentElement;
        let selectedElement = null;
        lists.forEach(list => {
            Array.from(list.children).forEach(li => {
                const liIndex = parseInt(li.dataset.index, 10);
                const isSelected = Number.isInteger(currentSelectedIndex) && liIndex === currentSelectedIndex;
                li.classList.toggle('selected-note', isSelected);
                if (isSelected) {
                    li.setAttribute('aria-current', 'true');
                    if (!selectedElement || !li.closest('.left-hidden')) {
                        selectedElement = li;
                    }
                } else {
                    li.removeAttribute('aria-current');
                }
            });
        });

        if (!shouldScroll || !selectedElement || !listContainer) {
            return;
        }
        requestAnimationFrame(() => {
            try {
                selectedElement.scrollIntoView({ block: 'center', behavior: 'smooth', inline: 'nearest' });
            } catch (error) {
                selectedElement.scrollIntoView();
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

    function getActiveDirectorySection() {
        return getCurrentDirectoryBrowserSection();
    }

    function openSelectedDirectoryItemViewer() {
        const section = getActiveDirectorySection();
        const selectedNode = section && getSelectedDirectoryItemNode(section);
        const item = selectedNode && selectedNode._directoryItem;
        if (!section || !item) {
            return false;
        }
        if (item.kind === 'file') {
            openDirectoryViewer(section, item);
            return true;
        }
        if (item.kind === 'directory') {
            const noteIndex = getDirectoryNoteIndex(item.path);
            if (noteIndex >= 0) {
                showFileContent(noteIndex);
                return true;
            }
        }
        return false;
    }

    function focusSearchInput() {
        setLeftMenuTab('search');
        const input = document.getElementById('searchInput');
        if (!input) {
            return false;
        }
        input.focus();
        input.select();
        return true;
    }

    function activateViewModeShortcut(index) {
        const section = getActiveDirectorySection();
        if (!section) {
            return false;
        }
        const button = section.querySelectorAll('.view-mode-button')[index];
        if (!button) {
            return false;
        }
        button.click();
        return true;
    }

    function toggleActivePreview() {
        const section = getActiveDirectorySection();
        const button = section && section.querySelector('.preview-toggle-button');
        if (!button) {
            return false;
        }
        button.click();
        return true;
    }

    function setupHistoryKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            const editableTarget = isEditableShortcutTarget(event.target);
            const isMac = isMacPlatform();
            const openViewerShortcut = (isMac && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key === 'ArrowDown')
                || (!isMac && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === 'Enter');
            if (!editableTarget && openViewerShortcut) {
                if (openSelectedDirectoryItemViewer()) {
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

            if (!editableTarget && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
                if (/^[1-4]$/.test(event.key)) {
                    if (activateViewModeShortcut(Number(event.key) - 1)) {
                        event.preventDefault();
                    }
                    return;
                }
                if (event.key.toLowerCase() === 'e') {
                    if (toggleActivePreview()) {
                        event.preventDefault();
                    }
                    return;
                }
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

    let notes = [];
    let defaultItems = [];
    let currentHighlightKeywords = [];
    let currentTitleOnly = false;
    let currentAttachmentFilters = createEmptyAttachmentFilterState();
    const scrollContainers = [];
    let currentSelectedIndex = null;
    let isApplyingHistoryState = false;
    let historyDebounceTimer = null;
    let modalReturnFocusElement = null;
    let loadedListFilterValue = 'all';
    let currentLeftTab = 'main';

    let modal, modalTitle, modalBody, closeModalBtn;

    document.addEventListener('DOMContentLoaded', () => {
        modal = document.getElementById('fileModal');
        modalTitle = modal.querySelector('.modal-title');
        modalBody = modal.querySelector('.modal-body');
        closeModalBtn = modal.querySelector('.close');

        closeModalBtn.onclick = closeModal;
        window.onclick = function(event) {
            if (event.target == modal) {
                closeModal();
            }
        };
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.style.display === 'block') {
                closeModal();
            }
            if (event.key === 'Escape') {
                closeDirectoryActionMenu();
            }
        });
        document.addEventListener('click', (event) => {
            if (!event.target.closest('.directory-action-menu') && !event.target.closest('.directory-item')) {
                closeDirectoryActionMenu();
            }
        });

        setupHistoryKeyboardShortcuts();
        setupExtensionFilters();
        
        window.FilesIndexUtils.loadIndex('files.json')
            .then(data => {
                notes = window.FilesIndexUtils.directoryNotesFromIndex(data);
                notes.sort((a, b) => {
                    const aPriority = getFolderPriority(a && a.folder);
                    const bPriority = getFolderPriority(b && b.folder);
                    if (aPriority !== bPriority) {
                        return aPriority - bPriority;
                    }
                    const aTitle = (a && a.html_file) || '';
                    const bTitle = (b && b.html_file) || '';
                    return aTitle.localeCompare(bTitle, undefined, { sensitivity: 'base' });
                });
                notes.forEach((note, index) => {
                    const comparableTitle = toComparable(note.html_file || '');
                    const searchTitle = comparableTitle.trim();
                    note._index = index;
                    note._searchTitle = searchTitle;
                    note._searchTitleCollapsed = removeSpaces(searchTitle);
                    note._searchTitleStripped = removeSpacesAndParens(searchTitle);

                    const attachmentSearchValues = Array.isArray(note.files)
                        ? note.files.map(file => normalizeForSearch(file || ''))
                        : [];
                    note._searchAttachments = attachmentSearchValues;
                    note._searchAttachmentsCollapsed = attachmentSearchValues.map(removeSpaces);
                    note._searchAttachmentsStripped = attachmentSearchValues.map(removeSpacesAndParens);
                });

                defaultItems = notes.map(note => ({ note, index: note._index }));
                updateLoadedListFilterOptions(defaultItems);
                renderFileList(defaultItems);
                renderMainDirectoryList();
                setLeftMenuTab('main');
                currentHighlightKeywords = [];
                currentTitleOnly = false;
                currentAttachmentFilters = createEmptyAttachmentFilterState();

                const urlParams = new URLSearchParams(window.location.search);
                const searchQuery = urlParams.get('search');
                const titleOnlyParam = urlParams.get('titleOnly');
                const imageFilterParam = urlParams.get('image');
                const videoFilterParam = urlParams.get('video');
                const audioFilterParam = urlParams.get('audio');
                const documentFilterParam = urlParams.get('document');
                const returnTo = urlParams.get('returnTo');

                const searchInput = document.getElementById('searchInput');
                const titleOnlyCheckbox = document.getElementById('titleOnlyCheckbox');
                const imageFilterCheckbox = document.getElementById('imageFilter');
                const videoFilterCheckbox = document.getElementById('videoFilter');
                const audioFilterCheckbox = document.getElementById('audioFilter');
                const documentFilterCheckbox = document.getElementById('documentFilter');

                if (searchInput && searchQuery) {
                    searchInput.value = decodeURIComponent(searchQuery);
                }
                if (titleOnlyCheckbox && titleOnlyParam) {
                    titleOnlyCheckbox.checked = titleOnlyParam === '1';
                }
                if (imageFilterCheckbox && imageFilterParam) {
                    imageFilterCheckbox.checked = imageFilterParam === '1';
                }
                if (videoFilterCheckbox && videoFilterParam) {
                    videoFilterCheckbox.checked = videoFilterParam === '1';
                }
                if (audioFilterCheckbox && audioFilterParam) {
                    audioFilterCheckbox.checked = audioFilterParam === '1';
                }
                if (documentFilterCheckbox && documentFilterParam) {
                    documentFilterCheckbox.checked = documentFilterParam === '1';
                }

                filterTypes.forEach(type => {
                    const checkbox = document.getElementById(`${type}Filter`);
                    if (checkbox) {
                        updateExtensionVisibility(type, checkbox.checked, false);
                        if (checkbox.checked) {
                            const extParam = urlParams.get(`${type}_ext`);
                            if (extParam) {
                                const extensions = new Set(extParam.split(','));
                                const extensionContainer = getExtensionContainer(type);
                                if (extensionContainer) {
                                    extensions.forEach(ext => {
                                        const extCheckbox = extensionContainer.querySelector(`input[value="${ext}"]`);
                                        if (extCheckbox) {
                                            extCheckbox.checked = true;
                                        }
                                    });
                                }
                            }
                        }
                    }
                });
                
                if (returnTo) {
                    const dataroomLink = document.querySelector('nav a[onclick*="dataroom.html"]');
                    if (dataroomLink) {
                        dataroomLink.textContent = '자료실로 돌아가기';
                        dataroomLink.href = returnTo;
                        dataroomLink.onclick = null; // Prevent navigateWithSearch
                    }
                }

                if (searchQuery || imageFilterParam || videoFilterParam || audioFilterParam || documentFilterParam) {
                    setLeftMenuTab('search');
                    searchFiles();
                } else {
                    const htmlFile = urlParams.get('htmlFile');
                    if (htmlFile) {
                        const note = notes.find(item => item.html_file === htmlFile);
                        if (note) {
                            showFileContent(note._index, { skipHistory: true });
                        }
                    }
                }
                applyDirectoryUrlState(new URLSearchParams(window.location.search));
                recordDirectoryHistory('initial', { replace: true });
                window.addEventListener('popstate', () => {
                    applyDirectoryUrlState(new URLSearchParams(window.location.search));
                });
            });

        const titleOnlyCheckbox = document.getElementById('titleOnlyCheckbox');
        if (titleOnlyCheckbox) {
            titleOnlyCheckbox.addEventListener('change', () => searchFiles());
        }

        document.querySelectorAll('.left-menu-tab').forEach(button => {
            button.addEventListener('click', () => {
                setLeftMenuTab(button.dataset.leftTab);
            });
        });

        const mainDirectorySearchInput = document.getElementById('mainDirectorySearchInput');
        if (mainDirectorySearchInput) {
            mainDirectorySearchInput.addEventListener('input', () => renderMainDirectoryList());
        }

        const fileListEl = document.getElementById('file-list');
        const fileContentEl = document.getElementById('file-content');

        [fileListEl, fileContentEl].forEach(el => {
            if (!el) {
                return;
            }
            scrollContainers.push(el);
            el.addEventListener('scroll', handleScrollButtonVisibility, { passive: true });
        });

        window.addEventListener('scroll', handleScrollButtonVisibility, { passive: true });
        handleScrollButtonVisibility();
    });

    function openModal() {
        modalReturnFocusElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (modal) modal.style.display = 'block';
    }

    function closeModal(options = {}) {
        if (modal) modal.style.display = 'none';
        if (modalBody) modalBody.innerHTML = ''; // Clear content
        if (!options.skipHistory) {
            recordDirectoryHistory('viewer-close');
        }
        requestAnimationFrame(() => {
            const section = getCurrentDirectoryBrowserSection();
            if (section) {
                focusDirectoryBrowser(section);
                return;
            }
            if (modalReturnFocusElement && document.body.contains(modalReturnFocusElement)) {
                modalReturnFocusElement.focus({ preventScroll: true });
            }
        });
    }

    function viewDocumentInModal(fileUrl, fileExt, fileName) {
        modalTitle.textContent = fileName;
        modalBody.innerHTML = '';

        const pane = document.createElement('div');
        pane.className = 'directory-viewer-pane';
        if (window.DocumentViewer && window.DocumentViewer.render(pane, fileUrl, fileExt, fileName)) {
            modalBody.appendChild(pane);
            openModal();
            return;
        }

        const viewerUrl = buildDocumentViewerUrl(fileUrl, fileExt);
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (!viewerUrl) {
            window.open(fileUrl, '_blank');
            return;
        }

        if (isLocal && viewerUrl.includes('view.officeapps.live.com')) {
            modalBody.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <h3>Office 문서 뷰어 오류</h3>
                    <p>Office Online 뷰어는 로컬 파일에 직접 접근할 수 없습니다.</p>
                    <p>이 문서를 보려면 웹사이트를 공개 서버에 배포해야 합니다.</p>
                    <p>또는 <a href="${fileUrl}" target="_blank" download="${fileName}">여기</a>를 클릭하여 파일을 다운로드하고 로컬에서 여세요.</p>
                </div>
            `;
        } else {
            modalBody.innerHTML = `<iframe src="${viewerUrl}" style="width:100%; height:100%; border:none;"></iframe>`;
        }
        openModal();
    }

    function playAudioInModal(fileUrl, fileName) {
        const extension = (fileName.split('.').pop() || '').toLowerCase();
        const mimeType = getAudioMimeType(extension);
        const canStream = canPlayMimeType(mimeType);

        modalTitle.textContent = fileName;
        modalBody.innerHTML = '';

        if (canStream) {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.autoplay = true;
            audio.style.width = '100%';
            if (mimeType) {
                const source = document.createElement('source');
                source.src = fileUrl;
                source.type = mimeType;
                audio.appendChild(source);
            } else {
                audio.src = fileUrl;
            }
            modalBody.appendChild(audio);

            const downloadParagraph = document.createElement('p');
            downloadParagraph.style.textAlign = 'center';
            downloadParagraph.style.marginTop = '20px';
            const downloadLink = document.createElement('a');
            downloadLink.href = fileUrl;
            downloadLink.download = fileName;
            downloadLink.textContent = 'Download Audio';
            downloadParagraph.appendChild(downloadLink);
            modalBody.appendChild(downloadParagraph);
        } else {
            const wrapper = document.createElement('div');
            wrapper.style.padding = '20px';
            wrapper.style.textAlign = 'center';

            const heading = document.createElement('h3');
            heading.textContent = `${extension.toUpperCase()} 형식을 재생할 수 없습니다`;
            wrapper.appendChild(heading);

            const info = document.createElement('p');
            info.textContent = '현재 브라우저는 이 오디오 형식을 직접 재생하지 못합니다.';
            wrapper.appendChild(info);

            const download = document.createElement('p');
            download.innerHTML = `<a href="${fileUrl}" download="${fileName}">파일을 다운로드</a>한 후 데스크톱 플레이어에서 열거나, 아래 명령으로 MP3로 변환한 뒤 재생하세요.`;
            wrapper.appendChild(download);

            const command = document.createElement('pre');
            command.style.textAlign = 'left';
            command.style.background = '#f5f5f5';
            command.style.padding = '12px';
            command.style.borderRadius = '6px';
            command.style.overflowX = 'auto';
            command.textContent = `ffmpeg -i "${fileName}" "${fileName.replace(/\.[^.]+$/, '.mp3')}"`;
            wrapper.appendChild(command);

            modalBody.appendChild(wrapper);
        }

        openModal();
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
            return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`;
        }
        return '';
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

    function hasMatchingAttachment(note, filters) {
        const activeFilters = Object.entries(filters || {}).filter(([, state]) => state && state.enabled);
        if (!activeFilters.length) {
            return true; // No filters, so always match
        }

        if (!note.files || note.files.length === 0) {
            return false; // Has filters but no attachments
        }

        return note.files.some(file => {
            const fileExt = (file.split('.').pop() || '').toLowerCase();
            return activeFilters.some(([type, state]) => {
                const baseExtensions = filterExtensionSets[type] || new Set();
                const selectedExtensions = state.extensions && state.extensions.size > 0 ? state.extensions : baseExtensions;
                return selectedExtensions.has(fileExt);
            });
        });
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

    function countOccurrences(haystack, needle) {
        if (!needle || !haystack) {
            return 0;
        }
        let total = 0;
        let position = 0;
        while (true) {
            const index = haystack.indexOf(needle, position);
            if (index === -1) {
                break;
            }
            total += 1;
            position = index + needle.length;
        }
        return total;
    }

    function calculateMatchScore(note, matchKeywords, titleOnly) {
        if (!matchKeywords || matchKeywords.length === 0) {
            return 0;
        }
        return matchKeywords.reduce((total, keyword) => {
            let score = 0;
            score += countOccurrences(note._searchTitle, keyword);
            score += countOccurrences(note._searchTitleCollapsed, keyword);
            score += countOccurrences(note._searchTitleStripped, keyword);
            if (!titleOnly) {
                note._searchAttachments.forEach((attachmentValue, idx) => {
                    score += countOccurrences(attachmentValue, keyword);
                    score += countOccurrences(note._searchAttachmentsCollapsed[idx], keyword);
                    score += countOccurrences(note._searchAttachmentsStripped[idx], keyword);
                });
            }
            return total + score;
        }, 0);
    }

    function getNoteFileExtensions(note) {
        const extensions = new Set();
        const files = Array.isArray(note.file_details) ? note.file_details : [];
        files.forEach(file => {
            const ext = String(file.extension || '').toLowerCase();
            if (ext) {
                extensions.add(ext);
            }
        });
        if (!extensions.size && Array.isArray(note.files)) {
            note.files.forEach(fileName => {
                const ext = String(fileName || '').split('.').pop().toLowerCase();
                if (ext && ext !== String(fileName || '').toLowerCase()) {
                    extensions.add(ext);
                }
            });
        }
        return extensions;
    }

    function noteHasType(note, type) {
        const extensions = getNoteFileExtensions(note);
        const targetSet = filterExtensionSets[type];
        if (!targetSet) {
            return false;
        }
        return Array.from(extensions).some(ext => targetSet.has(ext));
    }

    function getLoadedListFilterValue() {
        const input = document.getElementById('loadedListFilter');
        return input ? input.value || 'all' : 'all';
    }

    function matchesLoadedListFilter(note, value) {
        if (!value || value === 'all') {
            return true;
        }
        if (value === 'empty') {
            return getNoteFileExtensions(note).size === 0;
        }
        if (value.startsWith('type:')) {
            return noteHasType(note, value.slice(5));
        }
        if (value.startsWith('ext:')) {
            return getNoteFileExtensions(note).has(value.slice(4));
        }
        if (value.startsWith('folder:')) {
            return String(note.folder || '') === value.slice(7);
        }
        return true;
    }

    function updateLoadedListFilterOptions(resultItems) {
        const input = document.getElementById('loadedListFilter');
        const chips = document.getElementById('loadedFilterChips');
        const resetButton = document.getElementById('loadedFilterReset');
        if (!input || !chips) {
            return;
        }
        const previousValue = input.value || loadedListFilterValue || 'all';
        const folders = new Map();
        const extensions = new Map();
        const typeCounts = new Map();
        let emptyCount = 0;

        resultItems.forEach(({ note }) => {
            const folder = String(note.folder || '').trim();
            if (folder) {
                folders.set(folder, (folders.get(folder) || 0) + 1);
            }

            const noteExtensions = getNoteFileExtensions(note);
            if (!noteExtensions.size) {
                emptyCount += 1;
            }
            noteExtensions.forEach(ext => {
                extensions.set(ext, (extensions.get(ext) || 0) + 1);
            });
            filterTypes.forEach(type => {
                if (noteHasType(note, type)) {
                    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
                }
            });
        });

        const typeLabels = {
            image: '이미지 포함',
            video: '동영상 포함',
            audio: '음성 포함',
            document: '문서 포함'
        };
        const filterOptions = [];

        Array.from(typeCounts.entries()).forEach(([type, count]) => {
            filterOptions.push({
                value: `type:${type}`,
                label: typeLabels[type] || type,
                count
            });
        });
        if (emptyCount) {
            filterOptions.push({
                value: 'empty',
                label: '첨부 없음',
                count: emptyCount
            });
        }
        Array.from(folders.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 30)
            .forEach(([folder, count]) => {
                filterOptions.push({
                    value: `folder:${folder}`,
                    label: folder,
                    count
                });
            });
        Array.from(extensions.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .forEach(([ext, count]) => {
                filterOptions.push({
                    value: `ext:${ext}`,
                    label: ext.toUpperCase(),
                    count
                });
            });

        const validValues = new Set(['all'].concat(filterOptions.map(option => option.value)));
        input.value = validValues.has(previousValue) ? previousValue : 'all';
        loadedListFilterValue = input.value;

        chips.innerHTML = '';
        filterOptions.slice(0, 64).forEach(option => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'loaded-filter-chip';
            button.dataset.filterValue = option.value;
            button.setAttribute('aria-pressed', option.value === loadedListFilterValue ? 'true' : 'false');
            button.innerHTML = `${escapeHtml(option.label)} <span class="loaded-filter-count">${Number(option.count || 0).toLocaleString()}</span>`;
            button.addEventListener('click', () => {
                input.value = option.value === input.value ? 'all' : option.value;
                searchFiles();
            });
            chips.appendChild(button);
        });

        if (resetButton) {
            resetButton.disabled = loadedListFilterValue === 'all';
            resetButton.onclick = () => {
                input.value = 'all';
                searchFiles();
            };
        }
    }

    function createLeftFolderIcon() {
        const icon = document.createElement('span');
        icon.className = 'note-list-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `
            <svg viewBox="0 0 64 48" focusable="false">
                <path fill="#78d3f2" d="M4 12a6 6 0 0 1 6-6h14l6 8h24a6 6 0 0 1 6 6v4H4z"></path>
                <path fill="#42a9da" d="M4 18h56v20a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z"></path>
            </svg>
        `;
        return icon;
    }

    function createNoteListItem(note, index, highlightKeywords = []) {
        const li = document.createElement('li');
        li.dataset.index = index;
        li.className = 'note-list-item';
        li.tabIndex = 0;
        li.appendChild(createLeftFolderIcon());

        const text = document.createElement('span');
        text.className = 'note-list-text';
        text.innerHTML = highlightText(note.html_file || '', highlightKeywords);
        li.appendChild(text);

        li.onclick = () => showFileContent(index);
        li.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showFileContent(index);
            }
        });
        return li;
    }

    function getTopLevelDirectoryItems() {
        return notes
            .filter(note => {
                const path = String(note.directory_path || '.');
                return path !== '.' && !path.includes('/');
            })
            .map(note => ({ note, index: note._index }));
    }

    function renderMainDirectoryList() {
        const list = document.getElementById('mainDirectories');
        if (!list) {
            return;
        }
        const input = document.getElementById('mainDirectorySearchInput');
        const rawQuery = (input && input.value ? input.value : '').trim();
        const normalizedQuery = normalizeForSearch(rawQuery);
        const matchKeywords = normalizedQuery
            ? normalizedQuery.split(/\s+/).filter(Boolean)
            : [];
        const highlightKeywords = matchKeywords.slice();

        const items = getTopLevelDirectoryItems()
            .filter(({ note }) => {
                if (!matchKeywords.length) {
                    return true;
                }
                return calculateMatchScore(note, matchKeywords, true) > 0;
            })
            .sort((a, b) => String(a.note.html_file || '').localeCompare(String(b.note.html_file || ''), undefined, { sensitivity: 'base' }));

        list.innerHTML = '';
        items.forEach(({ note, index }) => {
            list.appendChild(createNoteListItem(note, index, highlightKeywords));
        });
        updateSelectedListHighlight(false);
    }

    function setLeftMenuTab(tab) {
        const nextTab = tab === 'search' ? 'search' : 'main';
        currentLeftTab = nextTab;

        document.querySelectorAll('.left-menu-tab').forEach(button => {
            const isActive = button.dataset.leftTab === nextTab;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        const mainPanel = document.getElementById('mainDirectoryPanel');
        const searchPanel = document.getElementById('searchPanel');
        const mainList = document.getElementById('mainDirectories');
        const searchList = document.getElementById('files');
        const loadedFilterPanel = document.getElementById('loadedFilterPanel');
        if (mainPanel) {
            mainPanel.classList.toggle('left-hidden', nextTab !== 'main');
        }
        if (searchPanel) {
            searchPanel.classList.toggle('left-hidden', nextTab !== 'search');
        }
        if (mainList) {
            mainList.classList.toggle('left-hidden', nextTab !== 'main');
        }
        if (searchList) {
            searchList.classList.toggle('left-hidden', nextTab !== 'search');
        }
        if (loadedFilterPanel) {
            loadedFilterPanel.classList.toggle('left-hidden', nextTab !== 'search');
        }
        if (nextTab === 'main') {
            renderMainDirectoryList();
        }
        updateSelectedListHighlight(false);
    }

    function renderFileList(items, highlightKeywords = []) {
        const fileList = document.getElementById('files');
        if (!fileList) {
            return;
        }
        fileList.innerHTML = '';

        items.forEach(({ note, index }) => {
            fileList.appendChild(createNoteListItem(note, index, highlightKeywords));
        });
        updateSelectedListHighlight(false);
    }

    function showFileContent(index, options = {}) {
        document.querySelector('.container').classList.add('mobile-content-visible');
        const note = notes[index];
        if (!note) {
            return;
        }
        currentSelectedIndex = index;
        updateSelectedListHighlight(true);
        updateCurrentNoteHeader(note);

        const contentDiv = document.getElementById('content');
        contentDiv.innerHTML = '';

        const fileContentEl = document.getElementById('file-content');
        if (fileContentEl) {
            fileContentEl.scrollTop = 0;
        }

        const directoryBrowser = renderDirectoryBrowser(note);
        if (directoryBrowser) {
            contentDiv.appendChild(directoryBrowser);
            requestAnimationFrame(() => focusDirectoryBrowser(directoryBrowser));
        }
        if (!options.skipHistory) {
            recordDirectoryHistory('note');
        }
    }

    function viewDocumentInModal(fileUrl, fileExt, fileName) {
        modalTitle.textContent = fileName;
        modalBody.innerHTML = '';

        const pane = document.createElement('div');
        pane.className = 'directory-viewer-pane';
        if (window.DocumentViewer && window.DocumentViewer.render(pane, fileUrl, fileExt, fileName)) {
            modalBody.appendChild(pane);
            openModal();
            return;
        }

        const viewerUrl = buildDocumentViewerUrl(fileUrl, fileExt);
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (!viewerUrl) {
            window.open(fileUrl, '_blank');
            return;
        }

        if (isLocal && viewerUrl.includes('view.officeapps.live.com')) {
            modalBody.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <h3>Office 문서 뷰어 오류</h3>
                    <p>Office Online 뷰어는 로컬 파일에 직접 접근할 수 없습니다.</p>
                    <p>이 문서를 보려면 웹사이트를 공개 서버에 배포해야 합니다.</p>
                    <p>또는 <a href="${fileUrl}" target="_blank" download="${fileName}">여기</a>를 클릭하여 파일을 다운로드하고 로컬에서 여세요.</p>
                </div>
            `;
        } else {
            modalBody.innerHTML = `<iframe src="${viewerUrl}" style="width:100%; height:100%; border:none;"></iframe>`;
        }
        openModal();
    }

    function searchFiles() {
        document.querySelector('.container').classList.remove('mobile-content-visible');
        if (!notes.length) {
            return;
        }
        const input = document.getElementById('searchInput');
        const rawFilter = (input.value || '').trim();
        loadedListFilterValue = getLoadedListFilterValue();

        const titleOnly = isTitleOnlySelected();

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
            updateLoadedListFilterOptions(defaultItems);
            renderFileList(defaultItems.filter(({ note }) => matchesLoadedListFilter(note, loadedListFilterValue)));
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

        const matchKeywords = Array.from(matchKeywordSet);
        const highlightKeywords = Array.from(highlightKeywordSet);

        currentHighlightKeywords = highlightKeywords;
        currentTitleOnly = titleOnly;

        const filteredItems = notes.filter(note => {
            const textMatch = matchKeywords.length === 0 || calculateMatchScore(note, matchKeywords, titleOnly) > 0;
            const attachmentMatch = hasMatchingAttachment(note, currentAttachmentFilters);
            return textMatch && attachmentMatch;
        });

        const scoredItems = filteredItems
            .map(note => {
                const matchScore = calculateMatchScore(note, matchKeywords, titleOnly);
                const highlightMatchesTitle = countHighlightMatches(note.html_file || '', highlightKeywords);
                let highlightMatchesAttachments = 0;
                if (!titleOnly && Array.isArray(note.files)) {
                    note.files.forEach(file => {
                        highlightMatchesAttachments += countHighlightMatches(file || '', highlightKeywords);
                    });
                }
                const highlightScore = highlightMatchesTitle + highlightMatchesAttachments;
                return {
                    note,
                    index: note._index,
                    matchScore,
                    highlightScore
                };
            })
            .filter(item => item.matchScore > 0 || item.highlightScore > 0 || (matchKeywords.length === 0 && hasMatchingAttachment(item.note, currentAttachmentFilters)))
            .sort((a, b) => {
                if (b.highlightScore !== a.highlightScore) {
                    return b.highlightScore - a.highlightScore;
                }
                if (b.matchScore !== a.matchScore) {
                    return b.matchScore - a.matchScore;
                }
                return a.note.html_file.localeCompare(b.note.html_file);
            })
            .map(item => ({ note: item.note, index: item.index }));

        updateLoadedListFilterOptions(scoredItems);
        renderFileList(scoredItems.filter(({ note }) => matchesLoadedListFilter(note, loadedListFilterValue)), highlightKeywords);
    }

    function isTitleOnlySelected() {
        const checkbox = document.getElementById('titleOnlyCheckbox');
        return checkbox ? checkbox.checked : false;
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

    window.showFileContent = showFileContent;
    window.searchFiles = searchFiles;
    window.scrollToTop = scrollToTop;
    window.handleAttachmentFilterToggle = handleAttachmentFilterToggle;
})(window, document);
