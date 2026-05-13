(function () {
    'use strict';

    const keywordGroups = {
        js: new Set([
            'await', 'async', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
            'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import',
            'in', 'instanceof', 'let', 'new', 'of', 'return', 'static', 'super', 'switch', 'this', 'throw',
            'try', 'typeof', 'var', 'void', 'while', 'with', 'yield'
        ]),
        value: new Set(['false', 'Infinity', 'NaN', 'null', 'true', 'undefined']),
        css: new Set([
            'and', 'auto', 'block', 'border-box', 'center', 'flex', 'grid', 'inherit', 'initial', 'inline',
            'none', 'not', 'relative', 'absolute', 'fixed', 'sticky', 'transparent', 'unset'
        ])
    };

    const languageByExtension = {
        c: 'c',
        conf: 'conf',
        config: 'conf',
        cpp: 'cpp',
        cs: 'cs',
        css: 'css',
        env: 'env',
        go: 'go',
        h: 'c',
        htm: 'html',
        html: 'html',
        java: 'java',
        js: 'js',
        json: 'json',
        jsx: 'jsx',
        kt: 'kt',
        log: 'log',
        mjs: 'js',
        php: 'php',
        plist: 'xml',
        properties: 'properties',
        py: 'py',
        rb: 'rb',
        sh: 'sh',
        sql: 'sql',
        swift: 'swift',
        toml: 'toml',
        ts: 'ts',
        tsx: 'tsx',
        txt: 'text',
        vue: 'html',
        xml: 'xml',
        yaml: 'yaml',
        yml: 'yaml'
    };

    function getLanguage(ext) {
        const normalized = String(ext || '').toLowerCase().replace(/^\./, '');
        return languageByExtension[normalized] || normalized || 'text';
    }

    function getLanguageLabel(ext) {
        const language = getLanguage(ext);
        if (!language || language === 'text') {
            return 'TEXT';
        }
        return language.toUpperCase();
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function span(tokenClass, value) {
        return `<span class="${tokenClass}">${escapeHtml(value)}</span>`;
    }

    function isWordStart(char) {
        return /[A-Za-z_$]/.test(char);
    }

    function isWord(char) {
        return /[A-Za-z0-9_$-]/.test(char);
    }

    function highlightJsonLine(line) {
        let html = '';
        let index = 0;
        while (index < line.length) {
            const char = line[index];
            if (char === '"') {
                let end = index + 1;
                while (end < line.length) {
                    if (line[end] === '\\') {
                        end += 2;
                    } else if (line[end] === '"') {
                        end += 1;
                        break;
                    } else {
                        end += 1;
                    }
                }
                const after = line.slice(end).match(/^\s*:/);
                html += span(after ? 'syntax-property' : 'syntax-string', line.slice(index, end));
                index = end;
            } else if (/[0-9-]/.test(char) && /^-?\d/.test(line.slice(index))) {
                const match = line.slice(index).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
                html += span('syntax-number', match[0]);
                index += match[0].length;
            } else if (/^(true|false|null)\b/.test(line.slice(index))) {
                const match = line.slice(index).match(/^(true|false|null)\b/);
                html += span('syntax-constant', match[0]);
                index += match[0].length;
            } else {
                html += escapeHtml(char);
                index += 1;
            }
        }
        return html;
    }

    function highlightMarkupLine(line) {
        let escaped = escapeHtml(line);
        escaped = escaped.replace(/(&lt;!--.*?--&gt;)/g, '<span class="syntax-comment">$1</span>');
        escaped = escaped.replace(/(&lt;\/?)([A-Za-z][\w:-]*)/g, '$1<span class="syntax-tag">$2</span>');
        escaped = escaped.replace(/([\s])([A-Za-z_:][\w:.-]*)(=)/g, '$1<span class="syntax-attribute">$2</span>$3');
        escaped = escaped.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="syntax-string">$1</span>');
        return escaped;
    }

    function highlightCodeLine(line, language) {
        if (language === 'json') {
            return highlightJsonLine(line);
        }
        if (language === 'html' || language === 'xml') {
            return highlightMarkupLine(line);
        }

        let html = '';
        let index = 0;
        while (index < line.length) {
            const rest = line.slice(index);
            const char = line[index];

            if (rest.startsWith('//') || rest.startsWith('#')) {
                html += span('syntax-comment', rest);
                break;
            }
            if (rest.startsWith('/*')) {
                const end = rest.indexOf('*/', 2);
                const token = end >= 0 ? rest.slice(0, end + 2) : rest;
                html += span('syntax-comment', token);
                index += token.length;
                continue;
            }
            if (char === '"' || char === '\'' || char === '`') {
                const quote = char;
                let end = index + 1;
                while (end < line.length) {
                    if (line[end] === '\\') {
                        end += 2;
                    } else if (line[end] === quote) {
                        end += 1;
                        break;
                    } else {
                        end += 1;
                    }
                }
                html += span('syntax-string', line.slice(index, end));
                index = end;
                continue;
            }
            if (/[0-9]/.test(char)) {
                const match = rest.match(/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
                html += span('syntax-number', match[0]);
                index += match[0].length;
                continue;
            }
            if (isWordStart(char)) {
                const match = rest.match(/^[A-Za-z_$][A-Za-z0-9_$-]*/);
                const word = match[0];
                if (keywordGroups.js.has(word) || (language === 'css' && keywordGroups.css.has(word))) {
                    html += span('syntax-keyword', word);
                } else if (keywordGroups.value.has(word)) {
                    html += span('syntax-constant', word);
                } else if (rest.slice(word.length).trimStart().startsWith('(')) {
                    html += span('syntax-function', word);
                } else if (language === 'css' && rest.slice(word.length).trimStart().startsWith(':')) {
                    html += span('syntax-property', word);
                } else {
                    html += escapeHtml(word);
                }
                index += word.length;
                continue;
            }
            html += escapeHtml(char);
            index += 1;
        }
        return html;
    }

    function renderSource(pre, text, ext) {
        const language = getLanguage(ext);
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        pre.dataset.language = getLanguageLabel(ext);
        pre.classList.add('source-code-block', 'has-line-numbers', 'is-wrapped');
        if (pre._sourceLanguageLabel) {
            pre._sourceLanguageLabel.textContent = pre.dataset.language;
        }
        pre.innerHTML = lines.map((line, index) => {
            const code = line ? highlightCodeLine(line, language) : '&#8203;';
            return `<span class="source-line" data-line="${index + 1}"><span class="source-line-number">${index + 1}</span><span class="source-line-code">${code}</span></span>`;
        }).join('');
    }

    function addToolbarControls(toolbar, pre, getText) {
        if (!toolbar || !pre) {
            return;
        }

        const label = document.createElement('span');
        label.className = 'source-language-label';
        label.textContent = pre.dataset.language || 'TEXT';
        pre._sourceLanguageLabel = label;

        const lineButton = document.createElement('button');
        lineButton.type = 'button';
        lineButton.textContent = '줄번호';
        lineButton.setAttribute('aria-pressed', 'true');
        lineButton.addEventListener('click', () => {
            const enabled = !pre.classList.contains('has-line-numbers');
            pre.classList.toggle('has-line-numbers', enabled);
            lineButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        });

        const wrapButton = document.createElement('button');
        wrapButton.type = 'button';
        wrapButton.textContent = '줄바꿈';
        wrapButton.setAttribute('aria-pressed', 'true');
        wrapButton.addEventListener('click', () => {
            const enabled = !pre.classList.contains('is-wrapped');
            pre.classList.toggle('is-wrapped', enabled);
            wrapButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        });

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.textContent = '복사';
        copyButton.addEventListener('click', () => {
            const text = typeof getText === 'function' ? getText() : pre.textContent;
            if (!navigator.clipboard || !text) {
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                const previous = copyButton.textContent;
                copyButton.textContent = '복사됨';
                setTimeout(() => {
                    copyButton.textContent = previous;
                }, 1200);
            }).catch(() => {});
        });

        toolbar.insertBefore(label, toolbar.firstChild);
        toolbar.appendChild(lineButton);
        toolbar.appendChild(wrapButton);
        toolbar.appendChild(copyButton);
    }

    window.SourceViewer = {
        addToolbarControls,
        getLanguageLabel,
        render: renderSource
    };
}());
