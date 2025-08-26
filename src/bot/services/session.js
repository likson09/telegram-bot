const LocalSession = require('telegraf-session-local');
const fs = require('fs').promises;
const path = require('path');

class SessionService {
    constructor() {
        this.sessions = new Map();
        this.sessionFile = 'sessions.json';
        this.backupDir = 'session_backups';
        this.initialize();
    }

    // Инициализация сервиса
    initialize() {
        this.setupBackupDirectory();
        this.loadSessions();
        this.setupCleanupInterval();
    }

    // Настройка директории для бэкапов
    async setupBackupDirectory() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            console.log('✅ Директория для бэкапов сессий создана');
        } catch (error) {
            console.error('❌ Ошибка создания директории для бэкапов:', error);
        }
    }

    // Загрузка сессий из файла
    async loadSessions() {
        try {
            const data = await fs.readFile(this.sessionFile, 'utf8');
            const sessions = JSON.parse(data);
            
            for (const [key, value] of Object.entries(sessions)) {
                this.sessions.set(key, value);
            }
            
            console.log(`✅ Сессии загружены: ${this.sessions.size} записей`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📁 Файл сессий не найден, создаем новый');
                await this.saveSessions();
            } else {
                console.error('❌ Ошибка загрузки сессий:', error);
            }
        }
    }

    // Сохранение сессий в файл
    async saveSessions() {
        try {
            const sessionsObject = Object.fromEntries(this.sessions);
            await fs.writeFile(this.sessionFile, JSON.stringify(sessionsObject, null, 2));
        } catch (error) {
            console.error('❌ Ошибка сохранения сессий:', error);
        }
    }

    // Создание бэкапа сессий
    async createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupDir, `sessions_backup_${timestamp}.json`);
            
            const sessionsObject = Object.fromEntries(this.sessions);
            await fs.writeFile(backupFile, JSON.stringify(sessionsObject, null, 2));
            
            console.log(`✅ Бэкап сессий создан: ${backupFile}`);
            return backupFile;
        } catch (error) {
            console.error('❌ Ошибка создания бэкапа:', error);
            return null;
        }
    }

    // Получение сессии пользователя
    get(userId) {
        const sessionKey = `user:${userId}`;
        return this.sessions.get(sessionKey) || this.createDefaultSession(userId);
    }

    // Установка сессии пользователя
    set(userId, data) {
        const sessionKey = `user:${userId}`;
        const currentSession = this.get(userId);
        const updatedSession = { ...currentSession, ...data, lastModified: Date.now() };
        this.sessions.set(sessionKey, updatedSession);
        this.saveSessions(); // Асинхронное сохранение
        return updatedSession;
    }

    // Обновление части сессии
    update(userId, updates) {
        const currentSession = this.get(userId);
        return this.set(userId, { ...currentSession, ...updates });
    }

    // Удаление сессии пользователя
    delete(userId) {
        const sessionKey = `user:${userId}`;
        const deleted = this.sessions.delete(sessionKey);
        if (deleted) {
            this.saveSessions();
        }
        return deleted;
    }

    // Создание сессии по умолчанию
    createDefaultSession(userId) {
        const defaultSession = {
            userId: userId,
            userFio: null,
            shortFio: null,
            currentData: null,
            creatingShift: false,
            shiftData: {},
            adminAction: null,
            availableShifts: [],
            pendingApplications: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
            activityCount: 0
        };

        this.sessions.set(`user:${userId}`, defaultSession);
        return defaultSession;
    }

    // Получение всех сессий
    getAll() {
        return Object.fromEntries(this.sessions);
    }

    // Поиск сессий по критериям
    findSessions(criteria) {
        const results = [];
        
        for (const [key, session] of this.sessions) {
            let matches = true;
            
            for (const [field, value] of Object.entries(criteria)) {
                if (session[field] !== value) {
                    matches = false;
                    break;
                }
            }
            
            if (matches) {
                results.push({ key, session });
            }
        }
        
        return results;
    }

    // Поиск сессии по ФИО
    findByFio(fio) {
        return this.findSessions({ userFio: fio });
    }

    // Получение активных сессий (за последние 24 часа)
    getActiveSessions(hours = 24) {
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        const activeSessions = [];
        
        for (const [key, session] of this.sessions) {
            if (session.lastActivity && session.lastActivity > cutoffTime) {
                activeSessions.push({ key, session });
            }
        }
        
        return activeSessions;
    }

    // Очистка старых сессий
    async cleanupOldSessions(maxAgeHours = 72) {
        const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
        let removedCount = 0;
        
        for (const [key, session] of this.sessions) {
            if (session.lastActivity && session.lastActivity < cutoffTime) {
                this.sessions.delete(key);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            await this.saveSessions();
            console.log(`🧹 Очищено ${removedCount} старых сессий`);
        }
        
        return removedCount;
    }

    // Получение статистики сессий
    getStats() {
        const totalSessions = this.sessions.size;
        const activeSessions = this.getActiveSessions(24).length;
        const sessionsWithFio = this.findSessions({ userFio: { $ne: null } }).length;
        
        return {
            totalSessions,
            activeSessions,
            sessionsWithFio,
            sessionsWithoutFio: totalSessions - sessionsWithFio,
            lastUpdate: new Date().toISOString()
        };
    }

    // Настройка периодической очистки
    setupCleanupInterval() {
        // Очистка каждые 6 часов
        setInterval(async () => {
            await this.cleanupOldSessions(72); // Удаляем сессии старше 72 часов
            await this.createBackup(); // Создаем бэкап
        }, 6 * 60 * 60 * 1000);
    }

    // Middleware для Telegraf
    getMiddleware() {
        return async (ctx, next) => {
            const userId = ctx.from?.id;
            
            if (!userId) {
                return next();
            }

            // Получаем или создаем сессию
            let session = this.get(userId);
            
            // Обновляем время последней активности
            session.lastActivity = Date.now();
            session.activityCount = (session.activityCount || 0) + 1;
            
            // Сохраняем сессию в контексте
            ctx.session = session;
            
            try {
                await next();
            } finally {
                // Сохраняем изменения сессии после обработки
                if (ctx.session) {
                    this.set(userId, ctx.session);
                }
            }
        };
    }

    // Экспорт сессий
    async exportSessions(format = 'json') {
        try {
            const sessions = this.getAll();
            
            if (format === 'json') {
                return JSON.stringify(sessions, null, 2);
            } else if (format === 'csv') {
                return this.convertToCSV(sessions);
            }
            
            return sessions;
        } catch (error) {
            console.error('❌ Ошибка экспорта сессий:', error);
            throw error;
        }
    }

    // Конвертация в CSV
    convertToCSV(sessions) {
        const rows = [];
        const headers = ['userId', 'userFio', 'createdAt', 'lastActivity', 'activityCount'];
        
        rows.push(headers.join(','));
        
        for (const [key, session] of Object.entries(sessions)) {
            if (key.startsWith('user:')) {
                const row = headers.map(header => {
                    const value = session[header];
                    return value !== null && value !== undefined ? `"${value}"` : '""';
                });
                rows.push(row.join(','));
            }
        }
        
        return rows.join('\n');
    }

    // Импорт сессий
    async importSessions(data, format = 'json') {
        try {
            let sessions;
            
            if (format === 'json') {
                sessions = JSON.parse(data);
            } else if (format === 'csv') {
                sessions = this.parseCSV(data);
            } else {
                throw new Error('Unsupported format');
            }
            
            for (const [key, session] of Object.entries(sessions)) {
                this.sessions.set(key, session);
            }
            
            await this.saveSessions();
            console.log(`✅ Импортировано ${Object.keys(sessions).length} сессий`);
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка импорта сессий:', error);
            throw error;
        }
    }

    // Парсинг CSV
    parseCSV(csvData) {
        // Простая реализация парсинга CSV
        const lines = csvData.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const sessions = {};
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
            if (values.length === headers.length) {
                const session = {};
                headers.forEach((header, index) => {
                    session[header] = values[index] || null;
                });
                sessions[`user:${session.userId}`] = session;
            }
        }
        
        return sessions;
    }

    // Сброс всех сессий
    async resetAll() {
        const count = this.sessions.size;
        this.sessions.clear();
        await this.saveSessions();
        console.log(`♻️ Сброшено всех сессий: ${count}`);
        return count;
    }

    // Получение размера сессий в памяти
    getMemoryUsage() {
        const approxSize = JSON.stringify(Object.fromEntries(this.sessions)).length;
        return {
            sizeBytes: approxSize,
            sizeKB: Math.round(approxSize / 1024),
            sizeMB: Math.round(approxSize / 1024 / 1024),
            sessionCount: this.sessions.size
        };
    }
}

// Создание singleton instance
let sessionServiceInstance = null;

function getSessionService() {
    if (!sessionServiceInstance) {
        sessionServiceInstance = new SessionService();
    }
    return sessionServiceInstance;
}

module.exports = { SessionService, getSessionService };