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
    const DEPLOY_BASE_URL = 'https://softm.github.io/gitpages-explorer/'; // SOFTM-publishing-deploy-link 2026-07-10: 배포 화면 이동 링크 기준 URL
    const REMOTE_CHECK_INTERVAL_MS = 60000; // SOFTM-publishing-sync-notice 2026-07-10: 원격 grant SHA 확인 주기
    const REFLECTION_CHECK_INTERVAL_MS = 10000; // SOFTM-publishing-reflection-poll 2026-07-10: 저장 직후 Actions 반영 확인 주기
    const REFLECTION_CHECK_TIMEOUT_MS = 180000; // SOFTM-publishing-reflection-poll 2026-07-10: Actions 반영 자동 확인 최대 대기 시간
    const TOAST_DURATION_MS = 3600; // SOFTM-publishing-feedback 2026-07-10: 퍼블리싱 상태 전환 snackbar 표시 시간
    const GRANT_CHECK_ERROR_MESSAGE = '게시 설정 확인 실패. GitHub 토큰 정보를 확인하세요.'; // SOFTM-publishing-token-notice 2026-07-10: 게시 설정 확인 실패 시 토큰 확인 안내
    let toastStack = null;
    let lastToastKey = '';
    let lastToastAt = 0;

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

    function getDeployPageUrl() {
        try {
            const pathname = window.location && window.location.pathname ? window.location.pathname : '';
            const pageName = pathname.split('/').pop() || 'index.html';
            const targetPage = pageName && pageName !== 'admin.html' ? pageName : 'index.html';
            const target = new URL(targetPage, DEPLOY_BASE_URL);
            const params = new URLSearchParams(window.location && window.location.search ? window.location.search : '');
            params.delete('publish');
            const query = params.toString();
            if (query) {
                target.search = query;
            }
            return target.href;
        } catch (error) {
            return DEPLOY_BASE_URL;
        }
    } // SOFTM-publishing-deploy-link 2026-07-10: 현재 로컬 화면에 대응하는 GitHub Pages URL 생성

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

    function ensurePublishingFeedbackStyles() {
        if (!document || document.getElementById('publishingFeedbackStyles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'publishingFeedbackStyles';
        style.textContent = `
            .publishing-activity-chip {
                gap: 6px;
            }
            .publishing-activity-chip::before {
                content: "";
                width: 6px;
                height: 6px;
                border-radius: 999px;
                background: currentColor;
                opacity: 0.8;
            }
            .publishing-activity-chip[data-type="pending"] {
                animation: publishingChipPulse 1.35s ease-in-out infinite;
            }
            .publishing-activity-chip[data-type="pending"]::before {
                animation: publishingDotBlink 0.9s steps(2, start) infinite;
            }
            .publishing-toast-stack {
                position: fixed;
                right: 18px;
                bottom: 18px;
                z-index: 100000;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 8px;
                pointer-events: none;
            }
            .publishing-toast {
                max-width: min(420px, calc(100vw - 32px));
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                background: #111827;
                color: #fff;
                box-shadow: 0 14px 35px rgba(15, 23, 42, 0.22);
                padding: 10px 12px;
                font-size: 14px;
                font-weight: 800;
                line-height: 1.35;
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.18s ease, transform 0.18s ease;
            }
            .publishing-toast.is-visible {
                opacity: 1;
                transform: translateY(0);
            }
            .publishing-toast[data-type="success"] {
                border-color: #75e0a7;
                background: #067647;
            }
            .publishing-toast[data-type="error"] {
                border-color: #fecdca;
                background: #b42318;
            }
            .publishing-toast[data-type="pending"] {
                border-color: #fedf89;
                background: #92400e;
            }
            @keyframes publishingChipPulse {
                0%, 100% { box-shadow: 0 0 0 rgba(245, 158, 11, 0); }
                50% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18); }
            }
            @keyframes publishingDotBlink {
                50% { opacity: 0.25; }
            }
            @media (max-width: 720px) {
                .publishing-toast-stack {
                    left: 12px;
                    right: 12px;
                    bottom: 12px;
                    align-items: stretch;
                }
                .publishing-toast {
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function showPublishingToast(message, type = '') {
        if (!message || !document || !document.body) {
            return;
        }
        ensurePublishingFeedbackStyles();
        const now = Date.now();
        const toastKey = `${type}:${message}`;
        if (toastKey === lastToastKey && now - lastToastAt < 2400) {
            return;
        }
        lastToastKey = toastKey;
        lastToastAt = now;
        if (!toastStack || !document.body.contains(toastStack)) {
            toastStack = document.createElement('div');
            toastStack.className = 'publishing-toast-stack';
            toastStack.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastStack);
        }
        const toast = document.createElement('div');
        toast.className = 'publishing-toast';
        toast.dataset.type = type || 'default';
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.textContent = message;
        toastStack.appendChild(toast);
        window.setTimeout(() => toast.classList.add('is-visible'), 20);
        window.setTimeout(() => {
            toast.classList.remove('is-visible');
            window.setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 220);
        }, TOAST_DURATION_MS);
    } // SOFTM-publishing-feedback 2026-07-10: 상태 전환 snackbar와 진행 중 점멸 스타일 공통 처리

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

    /* SOFTM-publishing-condition-filter 2026-07-10: 게시 상태 검색 필터 공통 판정 시작 */
    function normalizePublishingFilter(value) {
        if (!isPublishingFilterEnabled()) {
            return 'all';
        }
        const normalized = String(value || 'all').trim().toLowerCase();
        return ['all', 'published', 'unpublished'].includes(normalized) ? normalized : 'all';
    }

    function isPublishingFilterEnabled() {
        try {
            const hostname = window.location && String(window.location.hostname || '').toLowerCase();
            return hostname === 'localhost' || hostname === '127.0.0.1';
        } catch (error) {
            return false;
        }
    } // SOFTM-publishing-filter-localhost-only 2026-07-10: 게시 상태 검색 조건은 localhost/127.0.0.1에서만 활성화

    function publishingFilterLabel(value) {
        const normalized = normalizePublishingFilter(value);
        if (normalized === 'published') {
            return '게시';
        }
        if (normalized === 'unpublished') {
            return '미게시';
        }
        return '전체';
    }

    function matchesPublishingFilter(manager, path, security, value) {
        const filter = normalizePublishingFilter(value);
        if (!manager || typeof manager.getStatus !== 'function') {
            const privateByFallback = hasPrivateSuffix(path) || Boolean(security && security.private);
            if (filter === 'published') {
                return !privateByFallback;
            }
            if (filter === 'unpublished') {
                return privateByFallback;
            }
            return true;
        }
        if (filter === 'all') {
            return typeof manager.isVisible === 'function' ? manager.isVisible(path, security) : true;
        }
        const status = manager.getStatus(path, security);
        if (filter === 'published') {
            return Boolean(status && status.isPublished);
        }
        return Boolean(manager.isAdmin && manager.isAdmin() && status && status.isPrivate);
    }
    /* SOFTM-publishing-condition-filter 2026-07-10: 게시 상태 검색 필터 공통 판정 끝 */

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
        let activityStatus = '';
        let activityMessage = '';
        let remoteSha = '';
        let loadedRemoteSha = '';
        let syncStatus = '';
        let syncMessage = '';
        let indexSyncStatus = '';
        let indexSyncMessage = '';
        let lastCheckedAt = '';
        let remoteCheckPromise = null;
        let remoteCheckTimer = null;
        let tokenCheckTimer = null;
        let reflectionCheckTimer = null;
        let autoSyncStarted = false;
        let focusSyncHandler = null;
        let visibilitySyncHandler = null;

        const activityTypeForToast = status => {
            if (status === 'success') {
                return 'success';
            }
            if (status === 'error') {
                return 'error';
            }
            return status ? 'pending' : '';
        };
        const notify = () => {
            subscribers.forEach(callback => callback(getSnapshot()));
        };
        const setStatus = (message, type = '', options = {}) => {
            const previousMessage = statusMessage;
            const previousType = statusType;
            statusMessage = message || '';
            statusType = type || '';
            notify();
            if (statusMessage && (options.toast || ((statusType === 'success' || statusType === 'error') && (statusMessage !== previousMessage || statusType !== previousType)))) {
                showPublishingToast(statusMessage, statusType);
            }
        };
        const setActivity = (status, message, options = {}) => {
            activityStatus = status || '';
            activityMessage = message || '';
            if (options.notify !== false) {
                notify();
            }
            if (options.toast && activityMessage) {
                showPublishingToast(activityMessage, options.toastType || activityTypeForToast(activityStatus));
            }
        };
        const setSyncState = (status, message, options = {}) => {
            syncStatus = status || '';
            syncMessage = message || '';
            if (options.checked) {
                lastCheckedAt = new Date().toISOString();
            }
            if (options.notify !== false) {
                notify();
            }
        };
        const setIndexSyncState = (status, message, options = {}) => {
            indexSyncStatus = status || '';
            indexSyncMessage = message || '';
            if (options.notify !== false) {
                notify();
            }
        };
        const getToken = () => {
            try {
                return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || '';
            } catch (error) {
                return '';
            }
        };
        const hasToken = () => Boolean(getToken());
        const canUseRemoteSync = () => isAdminSession() && hasToken();
        const resetRemoteSync = (options = {}) => {
            remoteSha = '';
            loadedRemoteSha = '';
            lastCheckedAt = '';
            indexSyncStatus = '';
            indexSyncMessage = '';
            activityStatus = '';
            activityMessage = '';
            setSyncState('', '', options);
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
            if (!token) {
                stopAutoSync();
                resetRemoteSync();
                return;
            }
            scheduleRemoteCheck(500);
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
            activityStatus,
            activityMessage,
            isAdmin: isAdminSession(),
            token: getToken(),
            remoteSha,
            loadedRemoteSha,
            syncStatus,
            syncMessage,
            indexSyncStatus,
            indexSyncMessage,
            lastCheckedAt
        });

        function updateSyncFromRemoteSha(options = {}) {
            if (!canUseRemoteSync()) {
                return;
            }
            if (remoteSha === loadedRemoteSha) {
                setSyncState('synced', '게시 설정 동기화됨', options);
                return;
            }
            if (getPendingCount() > 0) {
                setSyncState('conflict', '게시 설정에 서버 변경이 있습니다. 현재 수정 내용은 보존 중입니다.', options);
            } else {
                setSyncState('remote-changed', '게시 설정에 서버 변경이 있습니다. 최신 정보를 불러오세요.', options);
            }
        }

        function stopReflectionCheck() {
            if (reflectionCheckTimer) {
                window.clearTimeout(reflectionCheckTimer);
                reflectionCheckTimer = null;
            }
        }

        function stopAutoSync() {
            if (remoteCheckTimer) {
                window.clearInterval(remoteCheckTimer);
                remoteCheckTimer = null;
            }
            if (tokenCheckTimer) {
                window.clearTimeout(tokenCheckTimer);
                tokenCheckTimer = null;
            }
            if (focusSyncHandler) {
                window.removeEventListener('focus', focusSyncHandler);
                focusSyncHandler = null;
            }
            if (visibilitySyncHandler) {
                document.removeEventListener('visibilitychange', visibilitySyncHandler);
                visibilitySyncHandler = null;
            }
            stopReflectionCheck();
            autoSyncStarted = false;
        }

        function startAutoSync() {
            if (autoSyncStarted || !canUseRemoteSync()) {
                return;
            }
            autoSyncStarted = true;
            remoteCheckTimer = window.setInterval(() => {
                checkRemoteStatus({ reason: 'interval' });
            }, REMOTE_CHECK_INTERVAL_MS);
            focusSyncHandler = () => {
                checkRemoteStatus({ reason: 'focus' });
            };
            visibilitySyncHandler = () => {
                if (!document.hidden) {
                    checkRemoteStatus({ reason: 'visible' });
                }
            };
            window.addEventListener('focus', focusSyncHandler);
            document.addEventListener('visibilitychange', visibilitySyncHandler);
        }

        function scheduleRemoteCheck(delay = 0) {
            if (!canUseRemoteSync()) {
                return;
            }
            startAutoSync();
            if (tokenCheckTimer) {
                window.clearTimeout(tokenCheckTimer);
            }
            tokenCheckTimer = window.setTimeout(() => {
                tokenCheckTimer = null;
                checkRemoteStatus({ reason: 'scheduled' });
            }, Math.max(0, delay));
        }

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
            if (options.sha !== undefined) {
                loadedRemoteSha = options.sha || '';
                remoteSha = options.sha || '';
            }
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

        const getPublicDescendants = path => { // SOFTM-publishing-parent-state 2026-07-10: 하위 공개 예외가 있는 상위 디렉터리 상태 계산용 목록
            const normalized = normalizePath(path);
            if (!normalized || normalized === '.') {
                return [];
            }
            return Array.from(publicPaths)
                .map(normalizePath)
                .filter(publicPath => publicPath.startsWith(`${normalized}/`));
        };
        const hasPublicDescendant = path => getPublicDescendants(path).length > 0;
        const removePublicDescendants = path => { // SOFTM-publishing-parent-state 2026-07-10: 상위 디렉터리 미게시 시 하위 공개 예외까지 제거
            getPublicDescendants(path).forEach(publicPath => publicPaths.delete(publicPath));
        };
        const isVisible = (path, security) => isAdminSession() || !isPrivatePath(path, security) || hasPublicDescendant(path); // SOFTM-publishing-public-exception 2026-07-10: 공개 예외 파일까지 탐색되도록 부모 폴더는 표시
        const getStatus = (path, security) => {
            const normalized = normalizePath(path);
            const suffixPrivate = hasPrivateSuffix(normalized);
            const grantStatus = resolveGrantVisibility(normalized, privatePaths, publicPaths);
            const privateByGrant = grantStatus.isPrivate;
            const publicByGrant = Boolean(grantStatus.matchedPublicPath && !grantStatus.isPrivate);
            const publicDescendants = getPublicDescendants(normalized);
            const hasPublishedDescendant = !suffixPrivate && publicDescendants.length > 0;
            const privateBySecurity = !grantLoaded && !publicByGrant && Boolean(security && security.private);
            const isPrivate = suffixPrivate || (privateByGrant && !hasPublishedDescendant) || privateBySecurity;
            return {
                path: normalized,
                isPrivate,
                isPublished: !isPrivate,
                canPublishOn: !suffixPrivate,
                source: suffixPrivate ? 'suffix' : (hasPublishedDescendant ? 'public-descendant' : (privateByGrant ? 'grant' : (publicByGrant ? 'public-grant' : (privateBySecurity ? 'index' : 'public')))),
                matchedGrantPath: privateByGrant ? grantStatus.matchedPrivatePath : '',
                matchedPublicPath: grantStatus.matchedPublicPath || '',
                matchedPublicDescendant: publicDescendants[0] || '',
                hasPublishedDescendant
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
            const previousStatus = getStatus(normalized, security);
            if (published) {
                privatePaths.delete(normalized);
                removePublicDescendants(normalized);
                if (getStatus(normalized, security).isPrivate) {
                    publicPaths.add(normalized);
                } else {
                    publicPaths.delete(normalized);
                }
            } else {
                publicPaths.delete(normalized);
                removePublicDescendants(normalized);
                if (!previousStatus.isPrivate) {
                    privatePaths.add(normalized);
                }
            }
            if (privatePaths.has(normalized)) {
                publicPaths.delete(normalized);
            } // SOFTM-publishing-public-exception 2026-07-10: 같은 경로가 private/public에 동시에 들어가지 않게 정리
            refreshPending();
            updateSyncFromRemoteSha({ notify: false });
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
                    resetRemoteSync({ notify: false });
                    notify();
                    return getSnapshot();
                }
                const data = await response.json();
                replaceGrantPaths(data || {});
                if (getToken()) {
                    return loadRemoteGrant({ silent: true, keepLocalOnError: true });
                }
                resetRemoteSync({ notify: false });
                setStatus('', '');
                return getSnapshot();
            } catch (error) {
                grantLoaded = false;
                replaceGrantPaths([], { loaded: false });
                if (getToken()) {
                    return loadRemoteGrant({ silent: true, keepLocalOnError: false });
                }
                resetRemoteSync({ notify: false });
                setStatus('grant.json을 읽지 못했습니다. 빈 설정으로 시작합니다.', 'error');
                return getSnapshot();
            }
        }

        function getApiUrl() {
            return `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/${encodeURIComponent(repository.path)}`;
        }

        function getRepositoryApiUrl(path = '') {
            const suffix = path ? `/${path.replace(/^\/+/, '')}` : '';
            return `https://api.github.com/repos/${repository.owner}/${repository.repo}${suffix}`;
        }

        function getContentsApiUrl(path) {
            const encodedPath = String(path || '')
                .split('/')
                .filter(Boolean)
                .map(part => encodeURIComponent(part))
                .join('/');
            return getRepositoryApiUrl(`contents/${encodedPath}`);
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

        async function fetchRemoteTextFile(token, path) {
            const response = await fetch(`${getContentsApiUrl(path)}?ref=${encodeURIComponent(repository.branch)}`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (!response.ok) {
                throw new Error(`GitHub ${path} 조회 실패: ${response.status}`);
            }
            const payload = await response.json();
            if (payload.content) {
                return decodeBase64Utf8(payload.content);
            }
            if (payload.download_url) {
                const rawResponse = await fetch(payload.download_url, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                });
                if (!rawResponse.ok) {
                    throw new Error(`GitHub ${path} 원문 조회 실패: ${rawResponse.status}`);
                }
                return rawResponse.text();
            }
            throw new Error(`GitHub ${path} 내용을 읽지 못했습니다.`);
        }

        async function fetchLocalTextFile(path) {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) {
                throw new Error(`로컬 ${path} 조회 실패: ${response.status}`);
            }
            return response.text();
        }

        async function checkIndexSync(options = {}) {
            if (!canUseRemoteSync()) {
                setIndexSyncState('', '', options);
                return '';
            }
            setIndexSyncState('checking', '인덱스 상태 확인 중입니다...', { notify: options.notify !== false });
            try {
                const [localIndex, remoteIndex] = await Promise.all([
                    fetchLocalTextFile('files.json'),
                    fetchRemoteTextFile(getToken(), 'files.json')
                ]);
                if (String(localIndex || '').trim() === String(remoteIndex || '').trim()) {
                    setIndexSyncState('synced', '인덱스 동기화됨', options);
                    return 'synced';
                }
                setIndexSyncState('remote-changed', '로컬 인덱스가 서버보다 오래됐습니다. git pull 필요.', options);
                return 'remote-changed';
            } catch (error) {
                setIndexSyncState('error', '인덱스 동기화 상태를 확인하지 못했습니다.', options);
                return 'error';
            }
        } // SOFTM-publishing-index-sync 2026-07-10: 원격 files.json과 로컬 files.json을 비교해 Actions 산출물 pull 필요 여부 표시

        async function fetchBranchHead(token) {
            const response = await fetch(getRepositoryApiUrl(`commits/${encodeURIComponent(repository.branch)}`), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (!response.ok) {
                throw new Error(`GitHub 브랜치 상태 조회 실패: ${response.status}`);
            }
            const payload = await response.json();
            return {
                sha: payload && payload.sha ? payload.sha : '',
                date: payload && payload.commit && payload.commit.committer ? payload.commit.committer.date || '' : ''
            };
        }

        function startReflectionCheck(baseCommitSha) {
            if (!baseCommitSha || !canUseRemoteSync()) {
                return;
            }
            stopReflectionCheck();
            const startedAt = Date.now();
            setActivity('reflecting', '확인중', { notify: false }); // SOFTM-publishing-activity-label 2026-07-10: 배포 인덱스 확인 활동 문구 간소화
            const run = async () => {
                if (!canUseRemoteSync()) {
                    stopReflectionCheck();
                    return;
                }
                if (Date.now() - startedAt > REFLECTION_CHECK_TIMEOUT_MS) {
                    stopReflectionCheck();
                    setActivity('delayed', '확인 지연', { notify: false });
                    setStatus('GitHub 커밋은 완료됐지만 Actions 반영 확인 시간이 초과됐습니다. 잠시 후 최신 정보를 불러오세요.', 'pending', { toast: true });
                    return;
                }
                try {
                    const head = await fetchBranchHead(getToken());
                    if (head.sha && head.sha !== baseCommitSha) {
                        stopReflectionCheck();
                        await loadRemoteGrant({ silent: true, force: true, keepLocalOnError: true });
                        setActivity('success', '반영 완료', { notify: false });
                        setStatus('GitHub Actions 반영을 확인하고 최신 정보를 다시 불러왔습니다.', 'success', { toast: true });
                        notify();
                        return;
                    }
                    setStatus('GitHub 커밋 완료. Actions 반영을 확인하는 중입니다...', 'pending');
                } catch (error) {
                    setStatus('GitHub 커밋 완료. Actions 반영 상태 확인을 다시 시도 중입니다...', 'pending');
                }
                reflectionCheckTimer = window.setTimeout(run, REFLECTION_CHECK_INTERVAL_MS);
            };
            setStatus('GitHub 커밋 완료. Actions 반영을 확인하는 중입니다...', 'pending', { toast: true });
            reflectionCheckTimer = window.setTimeout(run, REFLECTION_CHECK_INTERVAL_MS);
        } // SOFTM-publishing-feedback 2026-07-10: 저장 후 Actions 반영 확인 상태를 chip/snackbar로 표시

        async function checkRemoteStatus(options = {}) {
            if (!canUseRemoteSync()) {
                stopAutoSync();
                resetRemoteSync({ notify: options.notify !== false });
                return getSnapshot();
            }
            startAutoSync();
            if (remoteCheckPromise) {
                return remoteCheckPromise;
            }
            setSyncState('checking', '게시 설정 상태를 확인하는 중입니다...', { notify: options.notify !== false });
            remoteCheckPromise = (async () => {
                try {
                    const remote = await fetchRemoteGrant(getToken());
                    remoteSha = remote.sha || '';
                    if (!remoteSha && !loadedRemoteSha) {
                        setSyncState('synced', '게시 설정 동기화됨', { checked: true, notify: false });
                    } else {
                        updateSyncFromRemoteSha({ checked: true, notify: false });
                    }
                    await checkIndexSync({ notify: false });
                    notify();
                    return getSnapshot();
                } catch (error) {
                    setSyncState('error', GRANT_CHECK_ERROR_MESSAGE, { checked: true });
                    return getSnapshot();
                } finally {
                    remoteCheckPromise = null;
                }
            })();
            return remoteCheckPromise;
        }

        async function loadRemoteGrant(options = {}) {
            const token = getToken();
            if (!token) {
                resetRemoteSync({ notify: false });
                if (!options.silent) {
                    setStatus('GitHub 토큰을 입력하세요.', 'error');
                }
                return getSnapshot();
            }
            startAutoSync();
            if (getPendingCount() > 0 && !options.force) {
                updateSyncFromRemoteSha({ notify: false });
                if (!options.silent) {
                    setStatus('저장하지 않은 퍼블리싱 변경이 있어 GitHub 기준 불러오기를 건너뜁니다.', 'error');
                }
                return getSnapshot();
            }
            if (!options.silent) {
                setActivity('loading', '최신 정보 수신 중', { notify: false });
                setStatus('GitHub grant.json을 불러오는 중입니다...', 'pending');
            }
            setSyncState('checking', '게시 설정 상태를 확인하는 중입니다...', { notify: false });
            try {
                const remote = await fetchRemoteGrant(token);
                replaceGrantPaths(remote.grant || {}, { sha: remote.sha || '' });
                setSyncState('synced', '게시 설정 동기화됨', { checked: true, notify: false });
                await checkIndexSync({ notify: false });
                if (!options.silent) {
                    setActivity('success', '최신 정보 수신 완료', { notify: false });
                }
                setStatus(options.silent ? '' : 'GitHub grant.json 기준으로 갱신했습니다.', options.silent ? '' : 'success');
                return getSnapshot();
            } catch (error) {
                if (!options.keepLocalOnError) {
                    replaceGrantPaths([], { loaded: false });
                }
                setSyncState('error', GRANT_CHECK_ERROR_MESSAGE, { checked: true, notify: false });
                if (!options.silent) {
                    setActivity('error', '수신 실패', { notify: false });
                }
                if (!options.silent) {
                    setStatus(error && error.message ? error.message : 'GitHub grant.json을 불러오지 못했습니다.', 'error');
                } else {
                    notify();
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
            setActivity('saving', '적용 중', { notify: false }); // SOFTM-publishing-button-labels 2026-07-10: 적용 버튼 문구와 진행 상태 문구 통일
            setStatus('GitHub grant.json을 갱신하는 중입니다...', 'pending', { toast: true });
            const remote = await fetchRemoteGrant(token);
            remoteSha = remote.sha || '';
            updateSyncFromRemoteSha({ checked: true, notify: false });
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
            const nextSha = result && result.content && result.content.sha ? result.content.sha : '';
            const savedCommitSha = result && result.commit && result.commit.sha ? result.commit.sha : '';
            replaceGrantPaths(grant, { sha: nextSha });
            if (nextSha) {
                setSyncState('synced', '게시 설정 동기화됨', { checked: true, notify: false });
            } else {
                setSyncState('checking', '게시 설정 상태를 확인하는 중입니다...', { notify: false });
                scheduleRemoteCheck(0);
            }
            if (savedCommitSha) {
                startReflectionCheck(savedCommitSha);
            } else {
                setActivity('success', '반영 완료', { notify: false });
                setStatus('GitHub에 grant.json 커밋을 만들었습니다. Actions 완료 후 배포에 반영됩니다.', 'success');
            }
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
            checkRemoteStatus,
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
        ensurePublishingFeedbackStyles();
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
        saveButton.textContent = '적용'; // SOFTM-publishing-button-labels 2026-07-10: 퍼블리싱 저장 버튼 문구 간소화

        const refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.className = 'publishing-save-button publishing-refresh-button';
        refreshButton.textContent = '새로고침'; // SOFTM-publishing-button-labels 2026-07-10: 원격 게시 설정 갱신 버튼 문구 간소화

        const deployLink = document.createElement('a');
        deployLink.className = 'publishing-save-button publishing-deploy-link';
        deployLink.textContent = 'softm.github.io';
        deployLink.target = '_blank';
        deployLink.rel = 'noopener';
        deployLink.href = getDeployPageUrl();
        deployLink.title = '배포 화면 새 탭으로 열기'; // SOFTM-publishing-deploy-link 2026-07-10: GitHub Pages 배포 화면 이동 링크 추가

        const meta = document.createElement('span');
        meta.className = 'publishing-meta';

        const activity = document.createElement('span');
        activity.className = 'publishing-sync-chip publishing-activity-chip';
        activity.hidden = true;

        const sync = document.createElement('span');
        sync.className = 'publishing-sync-chip';
        sync.hidden = true;

        const indexSync = document.createElement('span');
        indexSync.className = 'publishing-sync-chip publishing-index-sync-chip';
        indexSync.hidden = true;

        const status = document.createElement('span');
        status.className = 'publishing-status';

        const syncLabel = value => {
            if (value === 'checking' || value === 'synced' || value === 'remote-changed' || value === 'conflict' || value === 'error') return '게시'; // SOFTM-publishing-badge-labels 2026-07-10: 게시 설정 chip은 고정 라벨과 색상으로 상태 표현
            return '';
        };
        const syncType = value => {
            if (value === 'synced') return 'success';
            if (value === 'remote-changed' || value === 'conflict' || value === 'checking') return 'pending';
            if (value === 'error') return 'error';
            return '';
        };
        const indexSyncLabel = value => {
            if (value === 'checking' || value === 'synced' || value === 'remote-changed' || value === 'error') return '인덱스'; // SOFTM-publishing-badge-labels 2026-07-10: 인덱스 chip은 고정 라벨과 색상으로 상태 표현
            return '';
        };
        const activityLabel = value => {
            if (value === 'saving') return '적용 중'; // SOFTM-publishing-button-labels 2026-07-10: 저장 활동 chip 문구를 버튼 문구와 통일
            if (value === 'reflecting') return '확인중'; // SOFTM-publishing-activity-label 2026-07-10: 배포 인덱스 확인 chip 문구 간소화
            if (value === 'loading') return '최신 정보 수신 중';
            if (value === 'success') return '반영 완료';
            if (value === 'delayed') return '확인 지연';
            if (value === 'error') return '처리 실패';
            return '';
        };
        const activityType = value => {
            if (value === 'success') return 'success';
            if (value === 'error') return 'error';
            if (value === 'saving' || value === 'reflecting' || value === 'loading' || value === 'delayed') return 'pending';
            return '';
        };
        const compactStatusMessage = message => { // SOFTM-publishing-status-rows 2026-07-10: 상태 메시지 row 표시용 짧은 문구 변환
            if (!message) return '';
            const value = String(message);
            if (value === 'GitHub 커밋 완료. Actions 반영을 확인하는 중입니다...') return 'GitHub 커밋 완료. Actions 확인중';
            if (value === 'GitHub 커밋 완료. Actions 반영 상태 확인을 다시 시도 중입니다...') return 'GitHub 커밋 완료. 확인 재시도 중';
            if (value === '게시 설정에 서버 변경이 있습니다. 최신 정보를 불러오세요.') return '서버 변경 있음. 새로고침 필요';
            if (value === '게시 설정에 서버 변경이 있습니다. 현재 수정 내용은 보존 중입니다.') return '서버 변경 있음. 수정 내용 보존 중';
            if (value === '로컬 인덱스가 서버보다 오래됐습니다. git pull 필요.') return '로컬 인덱스 오래됨. git pull 필요';
            return value;
        };
        const renderStatusRows = (target, rows) => { // SOFTM-publishing-status-rows 2026-07-10: 여러 상태 메시지를 row 단위로 분리 표시
            target.textContent = '';
            rows.forEach(row => {
                const line = document.createElement('span');
                line.className = 'publishing-status-row';
                line.dataset.type = row.type || '';
                line.title = row.message || '';
                const label = document.createElement('span');
                label.className = 'publishing-status-row-label';
                label.textContent = row.label;
                const text = document.createElement('span');
                text.className = 'publishing-status-row-text';
                text.textContent = compactStatusMessage(row.message);
                line.appendChild(label);
                line.appendChild(text);
                target.appendChild(line);
            });
        };

        saveButton.addEventListener('click', async () => {
            saveButton.disabled = true;
            try {
                await manager.saveToGitHub();
                if (typeof options.onSaved === 'function') {
                    options.onSaved();
                }
            } catch (error) {
                const message = error && error.message ? error.message : 'GitHub 저장에 실패했습니다.';
                renderStatusRows(status, [{ label: '오류', message, type: 'error' }]);
                status.dataset.type = 'error';
                showPublishingToast(message, 'error');
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
            deployLink.href = getDeployPageUrl();
            deployLink.title = `${deployLink.href} 새 탭으로 열기`;
            meta.textContent = snapshot.pendingCount > 0
                ? `변경 ${snapshot.pendingCount.toLocaleString()}건`
                : '변경 없음';
            saveButton.disabled = snapshot.pendingCount === 0;
            refreshButton.disabled = snapshot.pendingCount > 0;
            refreshButton.classList.toggle('is-attention', snapshot.syncStatus === 'remote-changed');
            const activityText = activityLabel(snapshot.activityStatus);
            activity.textContent = activityText;
            activity.hidden = !activityText || !snapshot.token;
            activity.dataset.type = activityType(snapshot.activityStatus);
            activity.title = snapshot.activityMessage || '';
            const label = syncLabel(snapshot.syncStatus);
            sync.textContent = label;
            sync.hidden = !label || !snapshot.token;
            sync.dataset.type = syncType(snapshot.syncStatus);
            sync.title = snapshot.syncMessage || ''; // SOFTM-publishing-badge-labels 2026-07-10: 고정 라벨 chip의 상세 상태는 툴팁으로 제공
            const indexLabel = indexSyncLabel(snapshot.indexSyncStatus);
            indexSync.textContent = indexLabel;
            indexSync.hidden = !indexLabel || !snapshot.token;
            indexSync.dataset.type = syncType(snapshot.indexSyncStatus);
            indexSync.title = snapshot.indexSyncMessage || '';
            const syncMessage = snapshot.syncStatus === 'synced' ? '' : snapshot.syncMessage; // SOFTM-publishing-sync-dedupe 2026-07-10: 동기화 완료 문구는 chip에만 표시
            const indexMessage = snapshot.indexSyncStatus === 'synced' ? '' : snapshot.indexSyncMessage;
            const statusRows = [
                { label: '작업', message: snapshot.statusMessage, type: snapshot.statusType },
                { label: '게시', message: syncMessage, type: syncType(snapshot.syncStatus) },
                { label: '인덱스', message: indexMessage, type: syncType(snapshot.indexSyncStatus) }
            ].filter((row, index, list) => row.message && list.findIndex(item => item.message === row.message) === index);
            renderStatusRows(status, statusRows);
            status.dataset.type = snapshot.statusType || syncType(snapshot.indexSyncStatus) || syncType(snapshot.syncStatus);
        });

        panel.appendChild(label);
        panel.appendChild(saveButton);
        panel.appendChild(refreshButton);
        panel.appendChild(deployLink);
        panel.appendChild(meta);
        panel.appendChild(activity);
        panel.appendChild(sync);
        panel.appendChild(indexSync);
        panel.appendChild(status);
        return panel;
    }

    window.PublishingUtils = {
        createManager,
        createToggleButton,
        createPanel,
        normalizePath,
        normalizePublishingFilter,
        isPublishingFilterEnabled,
        publishingFilterLabel,
        matchesPublishingFilter,
        isAdminSession,
        hasPrivateSuffix,
        pathMatchesPrivatePath
    };
    /* SOFTM-publishing-github 2026-07-09: 메인/자료실 GitHub API 퍼블리싱 저장 공통 유틸 끝 */
})(window, document);
