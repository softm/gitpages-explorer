(function (global) {
    const supportsNormalize = typeof String.prototype.normalize === 'function';
    const toNfc = (value) => (supportsNormalize && typeof value === 'string') ? value.normalize('NFC') : value;
    const PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const supportsNativeLazyLoading = global.HTMLImageElement && 'loading' in HTMLImageElement.prototype;
    const lazyObserver = (!supportsNativeLazyLoading && 'IntersectionObserver' in global)
        ? new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const target = entry.target;
                    if (target.dataset && target.dataset.src) {
                        target.src = target.dataset.src;
                        delete target.dataset.src;
                    }
                    observer.unobserve(target);
                }
            });
        }, { rootMargin: '150px 0px' })
        : null;

    const folderDomainRules = [
        {
            domain: 'https://evernote.softm.net/',
            folders: new Set([
                '내 노트',
                '내 노트 (1)',
                '내 노트 (2)',
                '내 노트 (3)',
                '내 노트 (4)',
                '내 노트 (5)',
                '내 노트 (6)',
                '내 노트 (7)'
            ].map(toNfc))
        },
        {
            domain: 'https://evernote2.softm.net/',
            folders: new Set([
                '내 노트 (8)',
                '내 노트 (9)',
                '내 노트 (10)',
                '내 노트 (11)',
                '내 노트 (12)',
                '내 노트 (13)',
                '내 노트 (14)',
                '내 노트 (15)',
            ].map(toNfc))
        },
        {
            domain: 'https://evernote3.softm.net/',
            folders: new Set([
                "내 노트 (16)",
                "내 노트 (17)",
                "내 노트 (18)",
                "내 노트 (19)",
                "내 노트 (20)",
                "내 노트 (21)",
                "내 노트 (22)",
                "내 노트 (23)",
                "내 노트 (24)",
                "내 노트 (25)",
                "내 노트 (26)",
                "내 노트 (27)",
                "내 노트 (28)"
            ].map(toNfc))
        }
    ];

    const hostRules = {
        'evernote.softm.net': folderDomainRules,
        'evernote2.softm.net': folderDomainRules,
        'evernote3.softm.net': folderDomainRules
    };

    function buildAttachmentPath(htmlFile, fileName) {
        const base = typeof htmlFile === 'string' ? htmlFile : '';
        const trimmed = base.endsWith('.html') ? base.slice(0, -5) : base;
        const filesDir = trimmed.endsWith(' files') ? trimmed : `${trimmed} files`;
        return `${filesDir}/${fileName}`;
    }

    const localHostnames = new Set(['127.0.0.1', 'localhost']);

    function resolveAttachmentDomain(folderName) {
        const hostname = (global.location && global.location.hostname) || '';
        if (!hostname || localHostnames.has(hostname)) {
            return '';
        }
        const rulesForHost = hostRules[hostname];
        if (!rulesForHost || typeof folderName !== 'string') {
            return '';
        }
        const normalizedFolder = toNfc(folderName.trim());
        for (const rule of rulesForHost) {
            if (rule.folders.has(normalizedFolder)) {
                return rule.domain;
            }
        }
        return '';
    }

    function buildAttachmentUrl(fileEntry, fileName) {
        let relativePath = '';
        const directoryPath = fileEntry && typeof fileEntry.directory_path === 'string'
            ? fileEntry.directory_path
            : '';
        if (directoryPath) {
            relativePath = directoryPath === '.' ? fileName : `${directoryPath}/${fileName}`;
        } else {
            relativePath = buildAttachmentPath(fileEntry && fileEntry.html_file, fileName);
        }
        const folderName = (fileEntry && fileEntry.folder) || '';
        const domainPrefix = resolveAttachmentDomain(folderName);
        const fullPath = domainPrefix ? `${domainPrefix}${relativePath}` : relativePath;
        return encodeURI(fullPath);
    }

    function buildNoteContentUrl(fileEntry) {
        if (fileEntry && fileEntry.content_path) {
            return encodeURI(fileEntry.content_path);
        }
        const htmlFile = (fileEntry && fileEntry.html_file) || '';
        const folderName = (fileEntry && fileEntry.folder) || '';
        const domainPrefix = resolveAttachmentDomain(folderName);
        const relativePath = htmlFile ? `${htmlFile}.html` : '';
        if (!relativePath) {
            return '';
        }
        const fullPath = domainPrefix ? `${domainPrefix}${relativePath}` : relativePath;
        return encodeURI(fullPath);
    }

    function setupLazyImage(img, src) {
        if (!img || !src) {
            return;
        }
        img.alt = img.alt || '';
        if (supportsNativeLazyLoading) {
            img.loading = 'lazy';
            img.src = src;
            return;
        }
        if (lazyObserver) {
            img.dataset.src = src;
            img.src = PLACEHOLDER_IMAGE;
            lazyObserver.observe(img);
            return;
        }
        img.src = src;
    }

    function getFolderSortOrder() {
        const ordered = [];
        const seen = new Set();
        const hostname = (global.location && global.location.hostname) || '';
        const rulesForHost = hostRules[hostname] || folderDomainRules;

        rulesForHost.forEach(rule => {
            if (!rule || !rule.folders) {
                return;
            }
            rule.folders.forEach(folderName => {
                const normalized = toNfc(folderName);
                if (!normalized || seen.has(normalized)) {
                    return;
                }
                seen.add(normalized);
                ordered.push(normalized);
            });
        });

        return ordered.slice();
    }

    global.AttachmentUtils = {
        buildAttachmentUrl,
        buildNoteContentUrl,
        setupLazyImage,
        getFolderSortOrder
    };
})(window);
