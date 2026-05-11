(function (global) {
    const TOKEN_RE = /[0-9A-Za-z가-힣]{2,}/g;
    const STOPWORDS = new Set([
        'files', 'file', 'index', 'html', 'json', 'jpeg', 'jpg', 'png', 'pdf', 'mp4', 'm4a', 'out',
        'the', 'and', 'for', 'with', 'from', '농업', '교육'
    ]);

    function rootNameFromIndex(index) {
        const root = index && index.summary && index.summary.root ? String(index.summary.root) : '';
        const parts = root.split(/[\\/]/).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : 'root';
    }

    async function fetchJson(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.status}`);
        }
        return response.json();
    }

    function resolveIndexUrl(indexPath) {
        return new URL(indexPath, window.location.href).href;
    }

    async function loadIndex(url) {
        const loaded = await loadIndexRecursive(resolveIndexUrl(url || 'files.json'), new Map());
        return loaded.index;
    }

    async function loadIndexRecursive(url, cache) {
        if (cache.has(url)) {
            return cache.get(url);
        }

        const pending = fetchJson(url).then(async index => {
            if (!index || index.schema_version !== 2 || index.index_type !== 'directory-manifest') {
                return { index, tree: index && index.tree, files: Array.isArray(index && index.files) ? index.files : [] };
            }

            const directFiles = Array.isArray(index.files) ? index.files.slice() : [];
            const childRefs = Array.isArray(index.child_indexes) ? index.child_indexes : [];
            const loadedChildren = await Promise.all(childRefs.map(child => loadIndexRecursive(resolveIndexUrl(child.index), cache)));
            const childTrees = loadedChildren.map(child => child.tree).filter(Boolean);
            const childFiles = loadedChildren.flatMap(child => child.files || []);
            const tree = Object.assign({}, index.tree || {}, {
                children: childTrees.concat(directFiles)
            });
            const files = directFiles.concat(childFiles);
            const merged = Object.assign({}, index, { tree, files });
            return { index: merged, tree, files };
        });

        cache.set(url, pending);
        return pending;
    }

    function topFolder(path, rootName) {
        if (!path || path === '.') {
            return rootName;
        }
        return String(path).split('/', 1)[0] || rootName;
    }

    function directoryNotesFromTree(node, rootName) {
        if (!node || node.type !== 'directory') {
            return [];
        }

        const relPath = node.path || '.';
        const children = Array.isArray(node.children) ? node.children : [];
        const childFiles = children.filter(child => child && child.type === 'file');
        const childDirs = children.filter(child => child && child.type === 'directory');
        const readmeFile = childFiles.find(child => /^readme\.md$/i.test(child.name || ''));
        const directoryBaseName = String(node.name || '').normalize('NFC').toLowerCase();
        const sameNameFile = childFiles.find(child => {
            const fileName = String(child.name || '').normalize('NFC').toLowerCase();
            return fileName === `${directoryBaseName}.md` || fileName === `${directoryBaseName}.html`;
        });
        const indexFile = relPath === '.'
            ? null
            : childFiles.find(child => /^index\.html$/i.test(child.name || ''));
        const contentFile = readmeFile || sameNameFile || indexFile || null;
        const note = {
            schema: 'directory-index',
            type: 'directory',
            html_file: relPath === '.' ? rootName : relPath,
            folder: topFolder(relPath, rootName),
            directory_path: relPath,
            content_path: contentFile ? contentFile.path : '',
            content_file: contentFile ? contentFile.name : '',
            modified: node.modified || null,
            file_count: node.file_count || 0,
            directory_count: node.directory_count || 0,
            total_size: node.total_size || 0,
            total_size_human: node.total_size_human || '0 B',
            child_directories: childDirs.map(child => ({
                name: child.name,
                path: child.path,
                file_count: child.file_count || 0,
                directory_count: child.directory_count || 0,
                modified: child.modified || null,
                total_size_human: child.total_size_human || '0 B'
            })),
            files: childFiles.map(child => child.name),
            file_details: childFiles.map(child => ({
                name: child.name,
                path: child.path,
                extension: child.extension,
                group: child.group,
                mime_type: child.mime_type,
                size: child.size || 0,
                size_human: child.size_human || '0 B',
                modified: child.modified || null,
                preview: child.preview || null
            }))
        };

        return [note].concat(childDirs.flatMap(child => directoryNotesFromTree(child, rootName)));
    }

    function directoryNotesFromIndex(index) {
        return directoryNotesFromTree(index && index.tree, rootNameFromIndex(index));
    }

    function dirname(path) {
        const value = String(path || '');
        const slash = value.lastIndexOf('/');
        return slash === -1 ? '.' : value.slice(0, slash);
    }

    function attachmentsFromIndex(index) {
        const rootName = rootNameFromIndex(index);
        const files = Array.isArray(index && index.files) ? index.files : [];
        return files.map(file => {
            const directoryPath = dirname(file.path);
            return {
                html_file: directoryPath === '.' ? rootName : directoryPath,
                folder: topFolder(directoryPath, rootName),
                directory_path: directoryPath,
                filename: file.name,
                path: file.path,
                extension: file.extension,
                group: file.group,
                mime_type: file.mime_type,
                size: file.size || 0,
                size_human: file.size_human || '0 B',
                modified: file.modified || null,
                preview: file.preview || null
            };
        });
    }

    function normalize(value) {
        return String(value || '').normalize('NFC').toLowerCase();
    }

    function tokenize(value) {
        return (normalize(value).match(TOKEN_RE) || [])
            .filter(token => !STOPWORDS.has(token) && !/^\d+$/.test(token));
    }

    function wordcloudFromIndex(index, limit) {
        const files = Array.isArray(index && index.files) ? index.files : [];
        const counts = new Map();
        const examples = new Map();
        files.forEach(file => {
            tokenize(`${file.name || ''} ${file.path || ''}`).forEach(token => {
                counts.set(token, (counts.get(token) || 0) + 1);
                if (!examples.has(token)) {
                    examples.set(token, new Set());
                }
                examples.get(token).add(file.path || file.name || '');
            });
        });

        const terms = Array.from(counts.entries())
            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
            .slice(0, limit || 240)
            .map(([term, count]) => ({
                term,
                count,
                examples: Array.from(examples.get(term) || []).sort().slice(0, 10)
            }));

        return {
            schema_version: 1,
            generated_at: index && index.summary ? index.summary.generated_at : '',
            source_file_count: index && index.summary ? index.summary.file_count || 0 : 0,
            terms
        };
    }

    global.FilesIndexUtils = {
        loadIndex,
        directoryNotesFromIndex,
        attachmentsFromIndex,
        wordcloudFromIndex
    };
})(window);
