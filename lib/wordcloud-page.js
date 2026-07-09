(function (window, document) {
    let terms = [];
    let sourceIndex = null;
    let publishingManager = null;
    let publishingFilterValue = 'all'; // SOFTM-publishing-condition-filter 2026-07-10: 워드클라우드 게시 상태 조건 상태

    function normalize(value) {
        return (value || '').normalize('NFKC').toLowerCase().trim();
    }

    function openMainSearch(term) {
        const url = new URL('index.html', window.location.href);
        url.searchParams.set('search', term);
        url.searchParams.set('titleOnly', '0');
        if (publishingFilterValue && publishingFilterValue !== 'all') {
            url.searchParams.set('publish', publishingFilterValue);
        } // SOFTM-publishing-condition-filter 2026-07-10: 태그 클릭 시 게시 상태 조건을 메인 검색으로 전달
        window.location.href = url.href;
    }

    function fontSize(count, minCount, maxCount) {
        if (maxCount <= minCount) {
            return 18;
        }
        const ratio = (count - minCount) / (maxCount - minCount);
        return Math.round(14 + ratio * 34);
    }

    function normalizePublishingFilterValue(value) {
        return window.PublishingUtils && typeof window.PublishingUtils.normalizePublishingFilter === 'function'
            ? window.PublishingUtils.normalizePublishingFilter(value)
            : (['all', 'published', 'unpublished'].includes(String(value || 'all')) ? String(value || 'all') : 'all');
    }

    function setPublishingFilterValue(value) {
        publishingFilterValue = normalizePublishingFilterValue(value);
        const select = document.getElementById('publishingFilter');
        if (select) {
            select.value = publishingFilterValue;
        }
        return publishingFilterValue;
    }

    function getPublishingFilterValue() {
        const select = document.getElementById('publishingFilter');
        return normalizePublishingFilterValue(select ? select.value : publishingFilterValue);
    }

    function matchesPublishingCondition(file) {
        if (window.PublishingUtils && typeof window.PublishingUtils.matchesPublishingFilter === 'function') {
            return window.PublishingUtils.matchesPublishingFilter(publishingManager, file && (file.path || file.name), file && file.security, publishingFilterValue);
        }
        return true;
    }

    function rebuildTerms() {
        if (!sourceIndex || !window.FilesIndexUtils) {
            terms = [];
            return null;
        }
        const cloudData = window.FilesIndexUtils.wordcloudFromIndex(sourceIndex, {
            fileFilter: file => matchesPublishingCondition(file)
        });
        terms = Array.isArray(cloudData.terms) ? cloudData.terms : [];
        return cloudData;
    } // SOFTM-publishing-condition-filter 2026-07-10: 워드클라우드 집계를 게시 상태 조건 기준으로 재생성

    function render() {
        const cloud = document.getElementById('cloud');
        const labels = document.getElementById('labels');
        const searchInput = document.getElementById('searchInput');
        const limitSelect = document.getElementById('limitSelect');
        if (!cloud || !labels || !searchInput || !limitSelect) {
            return;
        }

        const query = normalize(searchInput.value);
        const limit = parseInt(limitSelect.value, 10) || 120;
        publishingFilterValue = getPublishingFilterValue();
        const filtered = terms
            .filter(item => !query || normalize(item.term).includes(query))
            .slice(0, limit);

        cloud.innerHTML = '';
        labels.innerHTML = '';

        const counts = filtered.map(item => item.count);
        const minCount = counts.length ? Math.min(...counts) : 0;
        const maxCount = counts.length ? Math.max(...counts) : 0;

        filtered.forEach(item => {
            const tag = document.createElement('button');
            tag.type = 'button';
            tag.className = 'tag';
            tag.textContent = item.term;
            tag.title = `${item.term} (${item.count})`;
            tag.style.fontSize = `${fontSize(item.count, minCount, maxCount)}px`;
            tag.addEventListener('click', () => openMainSearch(item.term));
            cloud.appendChild(tag);

            const row = document.createElement('div');
            row.className = 'label-row';
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = item.term;
            button.addEventListener('click', () => openMainSearch(item.term));
            const count = document.createElement('span');
            count.className = 'count';
            count.textContent = `${item.count.toLocaleString()}회`;
            row.appendChild(button);
            row.appendChild(count);
            labels.appendChild(row);
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const searchInput = document.getElementById('searchInput');
        const limitSelect = document.getElementById('limitSelect');
        const publishingFilter = document.getElementById('publishingFilter');
        const meta = document.getElementById('meta');

        const params = new URLSearchParams(window.location.search);
        const search = params.get('search');
        if (searchInput && search) {
            searchInput.value = search;
        }
        setPublishingFilterValue(params.get('publish') || 'all');

        publishingManager = window.PublishingUtils ? window.PublishingUtils.createManager() : null;
        const publishingReady = publishingManager ? publishingManager.loadLocalGrant() : Promise.resolve();

        Promise.all([publishingReady, window.FilesIndexUtils.loadIndex('files.json')])
            .then(([, data]) => {
                sourceIndex = data;
                const cloudData = rebuildTerms();
                if (meta) {
                    meta.textContent = `${Number(cloudData && cloudData.source_file_count || 0).toLocaleString()}개 파일 기준 · ${cloudData && cloudData.generated_at || ''}`;
                }
                render();
            });

        if (searchInput) {
            searchInput.addEventListener('input', render);
        }
        if (limitSelect) {
            limitSelect.addEventListener('change', render);
        }
        if (publishingFilter) {
            publishingFilter.addEventListener('change', () => {
                publishingFilterValue = getPublishingFilterValue();
                const cloudData = rebuildTerms();
                if (meta) {
                    meta.textContent = `${Number(cloudData && cloudData.source_file_count || 0).toLocaleString()}개 파일 기준 · ${cloudData && cloudData.generated_at || ''}`;
                }
                render();
            });
        } // SOFTM-publishing-condition-filter 2026-07-10: 워드클라우드 게시 상태 조건 변경 시 태그 재집계
    });
})(window, document);
