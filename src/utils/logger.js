class Logger {
    constructor() {
        this.logLevels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        this.currentLevel = process.env.LOG_LEVEL || 'info';
    }

    log(level, message, meta = {}) {
        if (this.logLevels[level] > this.logLevels[this.currentLevel]) {
            return;
        }

        const timestamp = new Date().toISOString();
        const levelUpper = level.toUpperCase().padEnd(5);
        
        let logMessage = `[${timestamp}] [${levelUpper}] ${message}`;
        
        if (Object.keys(meta).length > 0) {
            try {
                logMessage += ` | ${JSON.stringify(meta, null, 2)}`;
            } catch (e) {
                logMessage += ` | [Cannot stringify meta]`;
            }
        }

        // Безопасная запись в консоль
        try {
            if (level === 'error') {
                process.stderr.write(logMessage + '\n');
            } else {
                process.stdout.write(logMessage + '\n');
            }
        } catch (error) {
            // Игнорируем ошибки записи при работе в фоне
        }
    }

    error(message, error = null) {
        let meta = {};
        if (error instanceof Error) {
            meta = { 
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }
            };
        }
        this.log('error', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    // Простые методы для экспорта
    static error(message, error) {
        const logger = new Logger();
        logger.error(message, error);
    }

    static warn(message) {
        const logger = new Logger();
        logger.warn(message);
    }

    static info(message) {
        const logger = new Logger();
        logger.info(message);
    }

    static debug(message) {
        const logger = new Logger();
        logger.debug(message);
    }
}

// Экспорт instance для общего использования
module.exports = new Logger();

// Экспорт класса для статических вызовов
module.exports.Logger = Logger;