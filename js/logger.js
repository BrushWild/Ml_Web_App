// logger.js - Structured debug logging for the Onnx Web App pipeline
// Logs to both console and an on-screen log panel

const Logger = (() => {
    const LEVELS = {
        DEBUG: { label: 'DEBUG', color: '#888', consoleMethod: 'debug' },
        INFO: { label: 'INFO', color: '#4CAF50', consoleMethod: 'log' },
        WARN: { label: 'WARN', color: '#FF9800', consoleMethod: 'warn' },
        ERROR: { label: 'ERROR', color: '#f44336', consoleMethod: 'error' },
    };

    let logOutputEl = null;
    let groupDepth = 0;

    function getLogOutput() {
        if (!logOutputEl) {
            logOutputEl = document.getElementById('log-output');
        }
        return logOutputEl;
    }

    function timestamp() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour12: false }) +
            '.' + String(now.getMilliseconds()).padStart(3, '0');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatValue(val) {
        if (val === null || val === undefined) return String(val);
        if (typeof val === 'object') {
            try {
                return JSON.stringify(val, null, 2);
            } catch {
                return String(val);
            }
        }
        return String(val);
    }

    function log(level, ...args) {
        const levelInfo = LEVELS[level] || LEVELS.INFO;

        // Console output
        console[levelInfo.consoleMethod](`[${levelInfo.label}]`, ...args);

        // On-screen output
        const el = getLogOutput();
        if (!el) return;

        const message = args.map(formatValue).join(' ');
        const indent = '  '.repeat(groupDepth);
        const entry = document.createElement('div');
        entry.className = `log-entry log-${levelInfo.label.toLowerCase()}`;
        entry.innerHTML =
            `<span class="log-time">${timestamp()}</span>` +
            `<span class="log-level" style="color:${levelInfo.color}">[${levelInfo.label}]</span>` +
            `<span class="log-msg">${indent}${escapeHtml(message)}</span>`;

        el.appendChild(entry);
        el.scrollTop = el.scrollHeight;
    }

    return {
        debug: (...args) => log('DEBUG', ...args),
        info: (...args) => log('INFO', ...args),
        warn: (...args) => log('WARN', ...args),
        error: (...args) => log('ERROR', ...args),

        group: (label) => {
            log('INFO', `▸ ${label}`);
            groupDepth++;
        },
        groupEnd: () => {
            if (groupDepth > 0) groupDepth--;
        },

        /** Log a key-value table (object) as formatted lines */
        table: (label, obj) => {
            log('INFO', `── ${label} ──`);
            groupDepth++;
            for (const [key, value] of Object.entries(obj)) {
                log('DEBUG', `${key}: ${formatValue(value)}`);
            }
            groupDepth--;
        },

        clear: () => {
            const el = getLogOutput();
            if (el) el.innerHTML = '';
            groupDepth = 0;
        }
    };
})();
