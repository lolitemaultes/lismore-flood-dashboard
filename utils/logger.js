const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true' || false;

class Logger {
    static timestamp() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    static formatMessage(level, color, message) {
        return `${colors.gray}[${this.timestamp()}]${colors.reset} ${color}${level}${colors.reset} ${message}`;
    }

    static info(message, ...args) {
        console.log(this.formatMessage('INFO   ', colors.blue, message), ...args);
    }

    static success(message, ...args) {
        console.log(this.formatMessage('SUCCESS', colors.green, message), ...args);
    }

    static warn(message, ...args) {
        console.log(this.formatMessage('WARN   ', colors.yellow, message), ...args);
    }

    static error(message, ...args) {
        console.error(this.formatMessage('ERROR  ', colors.red, message), ...args);
    }

    static verbose(message, ...args) {
        if (VERBOSE_LOGGING) {
            console.log(this.formatMessage('DEBUG  ', colors.dim, message), ...args);
        }
    }

    static header(message) {
        console.log('');
        console.log(colors.cyan + '═'.repeat(60) + colors.reset);
        console.log(this.formatMessage('HEADER ', colors.bright, message));
        console.log(colors.cyan + '═'.repeat(60) + colors.reset);
    }

    static table(data) {
        if (!Array.isArray(data) || data.length === 0) {
            this.info('No data to display');
            return;
        }
        
        data.forEach(row => {
            const line = Object.entries(row)
                .map(([k, v]) => `${colors.gray}${k}:${colors.reset} ${v}`)
                .join(' | ');
            console.log(this.formatMessage('TABLE  ', colors.cyan, line));
        });
    }

    static setStatusManager(manager) {
        // No-op for compatibility
    }
}

// Simplified StatusManager - tracks status but doesn't render dashboard
class StatusManager {
    constructor() {
        this.components = {};
    }

    setServerInfo(info = {}) {
        // No-op
    }

    updateComponent(name, status, detail = '') {
        // No-op
    }

    renderBoard(force = false) {
        // No-op
    }
}

const statusManager = new StatusManager();

module.exports = { Logger, StatusManager, statusManager, colors };
