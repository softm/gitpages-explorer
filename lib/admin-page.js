(function (window, document) {
    const SENSITIVE_PATTERNS = [
        /-private(?:\.|$|\/)/i,
        /비공개|비밀|개인정보|주민|인증|계약|견적|세금|급여|계좌/i,
        /secret|password|passwd|token|credential|private|confidential|contract|tax|salary|account/i
    ];

    let adminConfig = null;
    let indexData = null;
    let grantData = { schema_version: 1, private_paths: [] };
    let allPaths = [];

    function $(id) {
        return document.getElementById(id);
    }

    function setStatus(message) {
        const status = $('adminStatus');
        if (status) {
            status.textContent = message || '';
        }
    }

    function isAuthenticated() {
        return window.sessionStorage.getItem('farmAdminAuthed') === '1';
    }

    function setAuthenticated(value) {
        if (value) {
            window.sessionStorage.setItem('farmAdminAuthed', '1');
        } else {
            window.sessionStorage.removeItem('farmAdminAuthed');
        }
    }

    async function fetchJsonOrDefault(url, fallback) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) {
                return fallback;
            }
            return await response.json();
        } catch (error) {
            return fallback;
        }
    }

    function flattenTree(node, out = []) {
        if (!node) {
            return out;
        }
        out.push({
            path: node.path || '.',
            name: node.name || '',
            kind: node.type || 'unknown',
            private: Boolean(node.security && node.security.private)
        });
        (node.children || []).forEach(child => flattenTree(child, out));
        return out;
    }

    function privatePathSet() {
        return new Set((grantData.private_paths || []).map(path => String(path)));
    }

    function isSensitiveCandidate(path) {
        return SENSITIVE_PATTERNS.some(pattern => pattern.test(path));
    }

    function renderRows() {
        const tbody = $('securityRows');
        if (!tbody) {
            return;
        }
        const query = ($('adminSearch').value || '').trim().toLowerCase();
        const granted = privatePathSet();
        const rows = allPaths
            .filter(item => !query || item.path.toLowerCase().includes(query))
            .filter(item => granted.has(item.path) || item.private || isSensitiveCandidate(item.path))
            .sort((a, b) => Number(granted.has(b.path)) - Number(granted.has(a.path)) || a.path.localeCompare(b.path));

        tbody.innerHTML = '';
        rows.forEach(item => {
            const isGranted = granted.has(item.path);
            const tr = document.createElement('tr');
            tr.className = isGranted || item.private ? 'is-private' : '';
            tr.innerHTML = `
                <td><span class="path">${escapeHtml(item.path)}</span></td>
                <td>${item.kind === 'directory' ? '디렉토리' : '파일'}</td>
                <td>${isGranted ? '<span class="badge">grant</span>' : item.private ? '<span class="badge">private</span>' : '<span class="badge">후보</span>'}</td>
                <td></td>
            `;
            const actionCell = tr.lastElementChild;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = isGranted ? 'danger' : 'primary';
            button.textContent = isGranted ? '삭제' : '추가';
            button.addEventListener('click', () => {
                if (isGranted) {
                    grantData.private_paths = (grantData.private_paths || []).filter(path => path !== item.path);
                } else {
                    addGrantPath(item.path);
                }
                renderRows();
            });
            actionCell.appendChild(button);
            tbody.appendChild(tr);
        });
        setStatus(`${rows.length.toLocaleString()}개 표시 · grant ${granted.size.toLocaleString()}개`);
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function addGrantPath(path) {
        const value = String(path || '').trim();
        if (!value) {
            return;
        }
        const paths = privatePathSet();
        paths.add(value);
        grantData.private_paths = Array.from(paths).sort();
    }

    function detectCandidates() {
        allPaths
            .filter(item => isSensitiveCandidate(item.path))
            .forEach(item => addGrantPath(item.path));
        renderRows();
    }

    async function saveGrant() {
        const payload = JSON.stringify({
            schema_version: 1,
            private_paths: Array.from(privatePathSet()).sort()
        }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });

        if ('showSaveFilePicker' in window) {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: 'grant.json',
                    types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                setStatus('grant.json 저장 완료');
                return;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    return;
                }
            }
        }

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'grant.json';
        link.click();
        URL.revokeObjectURL(link.href);
        setStatus('grant.json 다운로드 완료');
    }

    function showAdmin() {
        $('loginPanel').classList.add('hidden');
        $('adminPanel').classList.remove('hidden');
    }

    function showLogin() {
        $('adminPanel').classList.add('hidden');
        $('loginPanel').classList.remove('hidden');
    }

    async function loadAdminData() {
        indexData = await window.FilesIndexUtils.loadIndex('files.json');
        grantData = await fetchJsonOrDefault('grant.json', { schema_version: 1, private_paths: [] });
        allPaths = flattenTree(indexData.tree).filter(item => item.path && item.path !== '.');
        renderRows();
    }

    function login() {
        const id = $('adminId').value.trim();
        const password = $('adminPassword').value;
        const users = Array.isArray(adminConfig && adminConfig.users) ? adminConfig.users : [];
        const matched = users.some(user => user.id === id && user.password === password && user.role === 'admin');
        if (!matched) {
            $('loginStatus').textContent = '아이디 또는 비밀번호가 맞지 않습니다.';
            return;
        }
        setAuthenticated(true);
        showAdmin();
        loadAdminData();
    }

    document.addEventListener('DOMContentLoaded', async () => {
        adminConfig = await fetchJsonOrDefault('admin.json', {
            users: [{ id: 'admin', password: 'admin', role: 'admin' }]
        });

        $('loginButton').addEventListener('click', login);
        $('adminPassword').addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                login();
            }
        });
        $('logoutButton').addEventListener('click', () => {
            setAuthenticated(false);
            showLogin();
        });
        $('addManualButton').addEventListener('click', () => {
            addGrantPath($('manualPath').value);
            $('manualPath').value = '';
            renderRows();
        });
        $('detectButton').addEventListener('click', detectCandidates);
        $('saveButton').addEventListener('click', saveGrant);
        $('adminSearch').addEventListener('input', renderRows);

        if (isAuthenticated()) {
            showAdmin();
            loadAdminData();
        }
    });
})(window, document);
