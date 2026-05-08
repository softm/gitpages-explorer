(function (window, document) {
    let terms = [];

    function normalize(value) {
        return (value || '').normalize('NFKC').toLowerCase().trim();
    }

    function openMainSearch(term) {
        const url = new URL('index.html', window.location.href);
        url.searchParams.set('search', term);
        url.searchParams.set('titleOnly', '0');
        window.location.href = url.href;
    }

    function fontSize(count, minCount, maxCount) {
        if (maxCount <= minCount) {
            return 18;
        }
        const ratio = (count - minCount) / (maxCount - minCount);
        return Math.round(14 + ratio * 34);
    }

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
        const meta = document.getElementById('meta');

        const params = new URLSearchParams(window.location.search);
        const search = params.get('search');
        if (searchInput && search) {
            searchInput.value = search;
        }

        window.FilesIndexUtils.loadIndex('files.json')
            .then(data => {
                const cloudData = window.FilesIndexUtils.wordcloudFromIndex(data);
                terms = Array.isArray(cloudData.terms) ? cloudData.terms : [];
                if (meta) {
                    meta.textContent = `${Number(cloudData.source_file_count || 0).toLocaleString()}개 파일 기준 · ${cloudData.generated_at || ''}`;
                }
                render();
            });

        if (searchInput) {
            searchInput.addEventListener('input', render);
        }
        if (limitSelect) {
            limitSelect.addEventListener('change', render);
        }
    });
})(window, document);
