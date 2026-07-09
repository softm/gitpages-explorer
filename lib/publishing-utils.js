;(function (window, document) {
    /* SOFTM-publishing-github 2026-07-09: 메인/자료실 GitHub API 퍼블리싱 저장 공통 유틸 시작 */
    const TOKEN_STORAGE_KEY = 'gitpagesExplorer.githubToken';
    const ADMIN_SESSION_KEY = 'farmAdminAuthed';
    const DEFAULT_REPOSITORY = {
        owner: 'softm',
        repo: 'gitpages-explorer',
        branch: 'main',
        path: 'grant.json'
    };

    function normalizePath(path) {
        return String(path || '.')
            .replace(/\\/g, '/')
            .replace(/^\.\/+/, '')
            .replace(/\/+$/g, '') || '.';
    }

    function uniqueSorted(paths) {
        return Array.from(new Set((paths || [])
            .map(normalizePath)
            .filter(path => path && path !== '.')))
            .sort((a, b) => a.localeCompare(b));
    }

    function isAdminSession() {
        try {
            return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
        } catch (error) {
            return false;
        }
    }

    function hasPrivateSuffix(path) {
        return normalizePath(path).split('/').some(part => {
            const dotIndex = part.lastIndexOf('.');
            const stem = dotIndex > 0 ? part.slice(0, dotIndex) : part;
            return stem.endsWith('-private');
        });
    }

    function pathMatchesPrivatePath(path, privatePath) {
        const normalized = normalizePath(path);
        const privateValue = normalizePath(privatePath);
        return privateValue && privateValue !== '.'
            && (normalized === privateValue || normalized.startsWith(`${privateValue}/`));
    }

    function pathMatchScore(path) {
        const normalized = normalizePath(path);
        return normalized.split('/').filter(Boolean).length * 10000 + normalized.length;
    }

    function findMatchingGrantPath(path, paths) {
        const normalized = normalizePath(path);
        return Array.from(paths || [])
            .map(normalizePath)
            .filter(grantPath => pathMatchesPrivatePath(normalized, grantPath))
            .sort((a, b) => pathMatchScore(b) - pathMatchScore(a))[0] || '';
    }

    function resolveGrantVisibility(path, privatePaths, publicPaths) {
        const normalized = normalizePath(path);
        const privateMatch = findMatchingGrantPath(normalized, privatePaths);
        const publicMatch = findMatchingGrantPath(normalized, publicPaths);
        if (publicMatch && (!privateMatch || pathMatchScore(publicMatch) > pathMatchScore(privateMatch))) {
            return {
                isPrivate: false,
                matchedPrivatePath: privateMatch,
                matchedPublicPath: publicMatch,
                source: 'public-grant'
            };
        }
        return {
            isPrivate: Boolean(privateMatch),
            matchedPrivatePath: privateMatch,
            matchedPublicPath: publicMatch,
            source: privateMatch ? 'grant' : 'public'
        };
    }

    function createManager(options = {}) {
        const repository = Object.assign({}, DEFAULT_REPOSITORY, options.repository || {});
        const subscribers = new Set();
        let savedPrivatePaths = new Set();
        let savedPublicPaths = new Set();
        let privatePaths = new Set();
        let publicPaths = new Set();
        let pendingAdd = new Set();
        let pendingRemove = new Set();
        let pendingPublicAdd = new Set();
        let pendingPublicRemove = new Set();
        let grantLoaded = false;
        let statusMessage = '';
        let statusType = '';

        const notify = () => {
            subscribers.forEach(callback => callback(getSnapshot()));
        };
        const setStatus = (message, type = '') => {
            statusMessage = message || '';
            statusType = type || '';
            notify();
        };
        const getToken = () => {
            try {
                return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
            } catch (error) {
                return '';
            }
        };
        const setToken = token => {
            try {
                if (token) {
                    window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
                } else {
                    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
                }
            } catch (error) {
                // Session storage can be unavailable in restricted modes.
            }
        };
        const getPendingCount = () => pendingAdd.size + pendingRemove.size + pendingPublicAdd.size + pendingPublicRemove.size;
        const refreshPending = () => { // SOFTM-publishing-github 2026-07-09: grant.json 원본 대비 UI 변경분을 다시 계산
            pendingAdd = new Set();
            pendingRemove = new Set();
            privatePaths.forEach(path => {
                if (!savedPrivatePaths.has(path)) {
                    pendingAdd.add(path);
                }
            });
            savedPrivatePaths.forEach(path => {
                if (!privatePaths.has(path)) {
                    pendingRemove.add(path);
                }
            });
            pendingPublicAdd = new Set();
            pendingPublicRemove = new Set();
            publicPaths.forEach(path => {
                if (!savedPublicPaths.has(path)) {
                    pendingPublicAdd.add(path);
                }
            });
            savedPublicPaths.forEach(path => {
                if (!publicPaths.has(path)) {
                    pendingPublicRemove.add(path);
                }
            });
        };
        const getSnapshot = () => ({
            privatePaths: Array.from(privatePaths).sort(),
            publicPaths: Array.from(publicPaths).sort(),
            pendingAdd: Array.from(pendingAdd).sort(),
            pendingRemove: Array.from(pendingRemove).sort(),
            pendingPublicAdd: Array.from(pendingPublicAdd).sort(),
            pendingPublicRemove: Array.from(pendingPublicRemove).sort(),
            pendingCount: getPendingCount(),
            statusMessage,
            statusType,
            isAdmin: isAdminSession(),
            token: getToken()
        });
        const replaceGrantPaths = (grant, options = {}) => { // SOFTM-publishing-public-exception 2026-07-10: private/public 경로를 함께 화면 상태 기준선으로 교체
            grantLoaded = options.loaded !== false;
            const privateInput = Array.isArray(grant) ? grant : (grant && grant.private_paths) || [];
            const publicInput = Array.isArray(grant) ? [] : (grant && grant.public_paths) || [];
            privatePaths = new Set(uniqueSorted(privateInput || []));
            publicPaths = new Set(uniqueSorted(publicInput || []));
            privatePaths.forEach(path => publicPaths.delete(path));
            savedPrivatePaths = new Set(privatePaths);
            savedPublicPaths = new Set(publicPaths);
            pendingAdd = new Set();
            pendingRemove = new Set();
            pendingPublicAdd = new Set();
            pendingPublicRemove = new Set();
        };

        const isPrivatePath = (path, security) => {
            const normalized = normalizePath(path);
            if (!normalized || normalized === '.') {
                return false;
            }
            if (hasPrivateSuffix(normalized)) {
                return true;
            }
            const grantStatus = resolveGrantVisibility(normalized, privatePaths, publicPaths);
            if (grantStatus.matchedPublicPath && !grantStatus.isPrivate) {
                return false;
            }
            if (grantStatus.isPrivate) {
                return true;
            } // SOFTM-publishing-public-exception 2026-07-10: 부모 미게시 아래 공개 예외는 게시로 판정
            return !grantLoaded && Boolean(security && security.private); // SOFTM-publishing-grant-priority 2026-07-09: grant.json 로드 후에는 생성된 security보다 현재 grant 상태를 우선
        };

        const hasPublicDescendant = path => {
            const normalized = normalizePath(path);
            return Boolean(normalized && normalized !== '.'
                && Array.from(publicPaths).some(publicPath => normalizePath(publicPath).startsWith(`${normalized}/`)));
        };
        const isVisible = (path, security) => isAdminSession() || !isPrivatePath(path, security) || hasPublicDescendant(path); // SOFTM-publishing-public-exception 2026-07-10: 공개 예외 파일까지 탐색되도록 부모 폴더는 표시
        const getStatus = (path, security) => {
            const normalized = normalizePath(path);
            const suffixPrivate = hasPrivateSuffix(normalized);
            const grantStatus = resolveGrantVisibility(normalized, privatePaths, publicPaths);
            const privateByGrant = grantStatus.isPrivate;
            const publicByGrant = Boolean(grantStatus.matchedPublicPath && !grantStatus.isPrivate);
            const privateBySecurity = !grantLoaded && !publicByGrant && Boolean(security && security.private);
            const isPrivate = suffixPrivate || privateByGrant || privateBySecurity;
            return {
                path: normalized,
                isPrivate,
                isPublished: !isPrivate,
                canPublishOn: !suffixPrivate,
                source: suffixPrivate ? 'suffix' : (privateByGrant ? 'grant' : (publicByGrant ? 'public-grant' : (privateBySecurity ? 'index' : 'public'))),
                matchedGrantPath: privateByGrant ? grantStatus.matchedPrivatePath : '',
                matchedPublicPath: grantStatus.matchedPublicPath || ''
            };
        };

        const setPublished = (path, published, security) => {
            const normalized = normalizePath(path);
            if (!normalized || normalized === '.') {
                return false;
            }
            if (published && hasPrivateSuffix(normalized)) {
                setStatus('-private 이름 규칙으로 미게시된 항목은 이름 변경 후 게시할 수 있습니다.', 'error'); // SOFTM-publishing-state-label 2026-07-09: 퍼블리싱 상태 문구를 게시/미게시로 통일
                return false;
            }
            if (published) {
                privatePaths.delete(normalized);
                if (getStatus(normalized, security).isPrivate) {
                    publicPaths.add(normalized);
                } else {
                    publicPaths.delete(normalized);
                }
            } else {
                publicPaths.delete(normalized);
                if (!getStatus(normalized, security).isPrivate) {
                    privatePaths.add(normalized);
                }
            }
            if (privatePaths.has(normalized)) {
                publicPaths.delete(normalized);
            } // SOFTM-publishing-public-exception 2026-07-10: 같은 경로가 private/public에 동시에 들어가지 않게 정리
            refreshPending();
            if (getPendingCount() > 0) {
                setStatus(`퍼블리싱 변경 ${getPendingCount().toLocaleString()}건이 있습니다.`, 'pending');
            } else {
                setStatus('퍼블리싱 변경이 원복되었습니다.', '');
            }
            return true;
        };

        const toggle = (path, security) => {
            const status = getStatus(path, security);
            return setPublished(status.path, status.isPrivate, security); // SOFTM-publishing-public-exception 2026-07-10: 하위 파일 토글 시 부모 디렉터리 규칙을 제거하지 않고 해당 경로만 변경
        };

        async function loadLocalGrant() {
            try {
                const response = await fetch('grant.json', { cache: 'no-store' });
                if (!response.ok) {
                    replaceGrantPaths([]);
                    if (getToken()) {
                        return loadRemoteGrant({ silent: true, keepLocalOnError: true });
                    }
                    notify();
                    return getSnapshot();
                }
                const data = await response.json();
                replaceGrantPaths(data || {});
                if (getToken()) {
                    return loadRemoteGrant({ silent: true, keepLocalOnError: true });
                }
                setStatus('', '');
                return getSnapshot();
            } catch (error) {
                grantLoaded = false;
                replaceGrantPaths([], { loaded: false });
                if (getToken()) {
                    return loadRemoteGrant({ silent: true, keepLocalOnError: false });
                }
                setStatus('grant.json을 읽지 못했습니다. 빈 설정으로 시작합니다.', 'error');
                return getSnapshot();
            }
        }

        function getApiUrl() {
            return `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/${encodeURIComponent(repository.path)}`;
        }

        function decodeBase64Utf8(value) {
            const binary = window.atob(String(value || '').replace(/\s/g, ''));
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }
            return new TextDecoder().decode(bytes);
        }

        function encodeBase64Utf8(value) {
            const bytes = new TextEncoder().encode(value);
            let binary = '';
            bytes.forEach(byte => {
                binary += String.fromCharCode(byte);
            });
            return window.btoa(binary);
        }

        async function fetchRemoteGrant(token) {
            const response = await fetch(`${getApiUrl()}?ref=${encodeURIComponent(repository.branch)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (response.status === 404) {
                return { sha: '', grant: { schema_version: 1, private_paths: [] } };
            }
            if (!response.ok) {
                throw new Error(`GitHub grant.json 조회 실패: ${response.status}`);
            }
            const payload = await response.json();
            const grant = JSON.parse(decodeBase64Utf8(payload.content || ''));
            return {
                sha: payload.sha || '',
                grant: {
                    schema_version: Number(grant.schema_version || 1),
                    private_paths: uniqueSorted(grant.private_paths || []),
                    public_paths: uniqueSorted(grant.public_paths || [])
                }
            };
        }

        async function loadRemoteGrant(options = {}) {
            const token = getToken();
            if (!token) {
                if (!options.silent) {
                    setStatus('GitHub 토큰을 입력하세요.', 'error');
                }
                return getSnapshot();
            }
            if (getPendingCount() > 0 && !options.force) {
                if (!options.silent) {
                    setStatus('저장하지 않은 퍼블리싱 변경이 있어 GitHub 기준 불러오기를 건너뜁니다.', 'error');
                }
                return getSnapshot();
            }
            if (!options.silent) {
                setStatus('GitHub grant.json을 불러오는 중입니다...', 'pending');
            }
            try {
                const remote = await fetchRemoteGrant(token);
                replaceGrantPaths(remote.grant || {});
                setStatus(options.silent ? '' : 'GitHub grant.json 기준으로 갱신했습니다.', options.silent ? '' : 'success');
                return getSnapshot();
            } catch (error) {
                if (!options.keepLocalOnError) {
                    replaceGrantPaths([], { loaded: false });
                }
                if (!options.silent) {
                    setStatus(error && error.message ? error.message : 'GitHub grant.json을 불러오지 못했습니다.', 'error');
                }
                return getSnapshot();
            }
        }

        async function saveToGitHub() {
            const token = getToken();
            if (!token) {
                setStatus('GitHub 토큰을 입력하세요.', 'error');
                return null;
            }
            if (getPendingCount() === 0) {
                setStatus('반영할 퍼블리싱 변경이 없습니다.', '');
                return null;
            }
            setStatus('GitHub grant.json을 갱신하는 중입니다...', 'pending');
            const remote = await fetchRemoteGrant(token);
            const paths = new Set(uniqueSorted(remote.grant.private_paths || []));
            const publicGrantPaths = new Set(uniqueSorted(remote.grant.public_paths || []));
            pendingRemove.forEach(path => paths.delete(path));
            pendingAdd.forEach(path => {
                paths.add(path);
                publicGrantPaths.delete(path);
            });
            pendingPublicRemove.forEach(path => publicGrantPaths.delete(path));
            pendingPublicAdd.forEach(path => {
                publicGrantPaths.add(path);
                paths.delete(path);
            });
            const grant = {
                schema_version: 2,
                private_paths: uniqueSorted(Array.from(paths)),
                public_paths: uniqueSorted(Array.from(publicGrantPaths))
            };
            const body = {
                message: `Update publishing settings ${new Date().toISOString()}`,
                content: encodeBase64Utf8(`${JSON.stringify(grant, null, 2)}\n`),
                branch: repository.branch
            };
            if (remote.sha) {
                body.sha = remote.sha;
            }
            const response = await fetch(getApiUrl(), {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                    'X-GitHub-Api-Version': '2022-11-28'
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                let message = `GitHub 저장 실패: ${response.status}`;
                try {
                    const errorPayload = await response.json();
                    if (errorPayload && errorPayload.message) {
                        message = `${message} · ${errorPayload.message}`;
                    }
                } catch (error) {
                    // Keep status code message.
                }
                throw new Error(message);
            }
            const result = await response.json();
            replaceGrantPaths(grant);
            setStatus('GitHub에 grant.json 커밋을 만들었습니다. Actions 완료 후 배포에 반영됩니다.', 'success');
            notify();
            return result;
        }

        return {
            isAdmin: isAdminSession,
            normalizePath,
            loadLocalGrant,
            isPrivatePath,
            isVisible,
            getStatus,
            setPublished,
            toggle,
            getToken,
            setToken,
            loadRemoteGrant,
            saveToGitHub,
            subscribe(callback) {
                subscribers.add(callback);
                callback(getSnapshot());
                return () => subscribers.delete(callback);
            },
            getSnapshot
        };
    }

    function createToggleButton(manager, item, options = {}) {
        if (!manager || !manager.isAdmin()) {
            return null;
        }
        const path = options.path || item.path || item.directoryPath || '';
        if (!path || path === '.') {
            return null;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'publishing-toggle';
        let wasConnected = false;
        const refresh = () => {
            if (document.documentElement.contains(button)) {
                wasConnected = true;
            } else if (unsubscribe && wasConnected) {
                unsubscribe();
                return;
            } // SOFTM-publishing-remote-grant 2026-07-09: DOM에 붙기 전 초기 refresh에서 구독이 끊기지 않게 처리
            const status = manager.getStatus(path, item.security);
            button.textContent = status.isPrivate ? '현재 미게시' : '현재 게시';
            button.title = status.matchedGrantPath && status.matchedGrantPath !== status.path
                ? '현재 미게시 · 이 항목만 게시로 변경'
                : (status.isPrivate ? '현재 미게시 · 클릭하면 게시' : '현재 게시 · 클릭하면 미게시'); // SOFTM-publishing-current-state 2026-07-09: 버튼 문구에 현재 상태임을 명시
            button.setAttribute('aria-label', button.title);
            button.dataset.published = status.isPrivate ? 'false' : 'true';
            button.dataset.targetPath = status.path; // SOFTM-publishing-public-exception 2026-07-10: 버튼 대상도 부모 grant 경로가 아닌 현재 항목 경로로 고정
            button.setAttribute('aria-pressed', status.isPrivate ? 'false' : 'true'); // SOFTM-publishing-github 2026-07-09: 토글 상태를 접근성 속성으로 표시
        };
        button.addEventListener('pointerdown', event => {
            event.stopPropagation();
        }); // SOFTM-publishing-state-label 2026-07-09: 퍼블리싱 상태 버튼 클릭이 파일 행 드래그/선택으로 번지지 않게 차단
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (manager.toggle(path, item.security) && typeof options.onChange === 'function') {
                options.onChange();
            }
            refresh();
        });
        let unsubscribe = null;
        unsubscribe = manager.subscribe(refresh);
        button._publishingUnsubscribe = unsubscribe;
        return button;
    }

    function createPanel(manager, options = {}) {
        if (!manager || !manager.isAdmin()) {
            return null;
        }
        const panel = document.createElement('section');
        panel.className = `publishing-panel${options.compact ? ' publishing-panel--compact' : ''}`;
        panel.setAttribute('aria-label', '퍼블리싱 GitHub 반영');

        const label = document.createElement('label');
        label.className = 'publishing-token-label';
        label.textContent = 'GitHub 토큰';

        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'publishing-token-input';
        input.placeholder = 'github_pat_...';
        input.value = manager.getToken();
        input.autocomplete = 'off';
        input.addEventListener('input', () => manager.setToken(input.value.trim()));
        label.appendChild(input);

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'publishing-save-button';
        saveButton.textContent = 'GitHub에 반영';

        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.className = 'publishing-save-button publishing-refresh-button';
        refreshButton.textContent = 'GitHub에서 불러오기'; // SOFTM-publishing-remote-grant 2026-07-09: 토큰으로 원격 grant.json만 다시 읽어 화면 상태 갱신

        const meta = document.createElement('span');
        meta.className = 'publishing-meta';

        const status = document.createElement('span');
        status.className = 'publishing-status';

        saveButton.addEventListener('click', async () => {
            saveButton.disabled = true;
            try {
                await manager.saveToGitHub();
                if (typeof options.onSaved === 'function') {
                    options.onSaved();
                }
            } catch (error) {
                status.textContent = error && error.message ? error.message : 'GitHub 저장에 실패했습니다.';
                status.dataset.type = 'error';
            } finally {
                saveButton.disabled = manager.getSnapshot().pendingCount === 0; // SOFTM-publishing-github 2026-07-09: 저장 후 변경 없음 상태 유지
            }
        });

        refreshButton.addEventListener('click', async () => {
            refreshButton.disabled = true;
            try {
                await manager.loadRemoteGrant();
            } finally {
                refreshButton.disabled = false;
            }
        });

        manager.subscribe(snapshot => {
            input.value = snapshot.token || '';
            meta.textContent = snapshot.pendingCount > 0
                ? `변경 ${snapshot.pendingCount.toLocaleString()}건`
                : '변경 없음';
            saveButton.disabled = snapshot.pendingCount === 0;
            refreshButton.disabled = snapshot.pendingCount > 0;
            status.textContent = snapshot.statusMessage || '';
            status.dataset.type = snapshot.statusType || '';
        });

        panel.appendChild(label);
        panel.appendChild(saveButton);
        panel.appendChild(refreshButton);
        panel.appendChild(meta);
        panel.appendChild(status);
        return panel;
    }

    window.PublishingUtils = {
        createManager,
        createToggleButton,
        createPanel,
        normalizePath,
        isAdminSession,
        hasPrivateSuffix,
        pathMatchesPrivatePath
    };
    /* SOFTM-publishing-github 2026-07-09: 메인/자료실 GitHub API 퍼블리싱 저장 공통 유틸 끝 */
})(window, document);
