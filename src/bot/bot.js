const { Telegraf } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const { setupMainHandlers } = require('./handlers/main');
const { setupAdminHandlers } = require('./handlers/admin');
const { setupShiftHandlers } = require('./handlers/shifts');
const { setupApplicationHandlers } = require('./handlers/applications');
const { setupProductivityHandlers } = require('./handlers/productivity');

class TelegramBot {
    constructor(token) {
        this.bot = new Telegraf(token);
        this.setupSession();
    }

    // Настройка сессии
    setupSession() {
        this.bot.use((new LocalSession({ 
            database: 'sessions.json',
            storage: LocalSession.storageFileAsync,
            property: 'session',
            state: {
                userFio: null,
                shortFio: null,
                currentData: null,
                creatingShift: false,
                shiftData: {},
                adminAction: null,
                availableShifts: [],
                pendingApplications: []
            }
        })).middleware());
    }

    // Настройка всех обработчиков
    setupHandlers() {
        // Основные обработчики
        setupMainHandlers(this.bot);
        
        // Обработчики админских функций
        setupAdminHandlers(this.bot);
        
        // Обработчики работы со сменами
        setupShiftHandlers(this.bot);
        
        // Обработчики заявок на подработку
        setupApplicationHandlers(this.bot);
        
        // Обработчики производительности
        setupProductivityHandlers(this.bot);
        
        // Обработка ошибок
        this.setupErrorHandling();
    }

    // Обработка ошибок
    setupErrorHandling() {
        this.bot.catch((error, ctx) => {
            console.error('❌ Ошибка бота:', error);
            
            try {
                ctx.reply('❌ Произошла непредвиденная ошибка. Попробуйте позже или обратитесь к администратору.');
            } catch (replyError) {
                console.error('Не удалось отправить сообщение об ошибке:', replyError);
            }
        });

        // Обработка ошибок вебхука
        this.bot.use(async (ctx, next) => {
            try {
                await next();
            } catch (error) {
                console.error('Ошибка в middleware:', error);
                throw error;
            }
        });
    }

    // Запуск бота
    async launch() {
        try {
            console.log('🚀 Запуск Telegram бота...');
            
            this.setupHandlers();
            
            await this.bot.launch({
                dropPendingUpdates: true,
                polling: {
                    timeout: 10,
                    limit: 100,
                    allowedUpdates: ['message', 'callback_query']
                }
            });
            
            console.log('✅ Бот успешно запущен!');
            console.log('🤖 Бот готов к работе');
            
        } catch (error) {
            console.error('❌ Ошибка запуска бота:', error);
            throw error;
        }
    }

    // Остановка бота
    stop(signal) {
        try {
            this.bot.stop(signal);
            console.log(`🛑 Бот остановлен с сигналом: ${signal}`);
        } catch (error) {
            console.error('❌ Ошибка при остановке бота:', error);
        }
    }

    // Получение middleware для вебхука
    webhookCallback() {
        return this.bot.webhookCallback('/telegram-webhook');
    }

    // Получение экземпляра бота
    getBotInstance() {
        return this.bot;
    }

    // Получение информации о боте
    async getBotInfo() {
        try {
            return await this.bot.telegram.getMe();
        } catch (error) {
            console.error('❌ Ошибка получения информации о боте:', error);
            return null;
        }
    }

    // Проверка работоспособности
    async healthCheck() {
        try {
            const botInfo = await this.getBotInfo();
            return {
                status: 'healthy',
                botUsername: botInfo?.username,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Отправка сообщения пользователю
    async sendMessage(userId, message, options = {}) {
        try {
            await this.bot.telegram.sendMessage(userId, message, {
                parse_mode: 'Markdown',
                ...options
            });
            return true;
        } catch (error) {
            console.error(`❌ Ошибка отправки сообщения пользователю ${userId}:`, error);
            return false;
        }
    }

    // Массовая рассылка
    async broadcastMessage(userIds, message, options = {}) {
        const results = {
            successful: 0,
            failed: 0,
            errors: []
        };

        for (const userId of userIds) {
            try {
                const success = await this.sendMessage(userId, message, options);
                if (success) {
                    results.successful++;
                } else {
                    results.failed++;
                    results.errors.push({ userId, error: 'Failed to send message' });
                }
            } catch (error) {
                results.failed++;
                results.errors.push({ userId, error: error.message });
            }
        }

        return results;
    }

    // Обработка graceful shutdown
    setupGracefulShutdown() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        
        signals.forEach(signal => {
            process.once(signal, async () => {
                console.log(`\n${signal} получен, начинаем graceful shutdown...`);
                
                try {
                    await this.stop(signal);
                    console.log('✅ Graceful shutdown завершен');
                    process.exit(0);
                } catch (error) {
                    console.error('❌ Ошибка при graceful shutdown:', error);
                    process.exit(1);
                }
            });
        });

        // Обработка необработанных исключений
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Необработанное исключение:', reason);
        });

        process.on('uncaughtException', (error) => {
            console.error('❌ Непойманное исключение:', error);
            process.exit(1);
        });
    }

    // Метод для middleware (если нужно добавить кастомные обработчики)
    use(middleware) {
        this.bot.use(middleware);
    }

    // Метод для регистрации кастомных команд
    command(command, handler) {
        this.bot.command(command, handler);
    }

    // Метод для регистрации кастомных действий
    action(action, handler) {
        this.bot.action(action, handler);
    }

    // Метод для регистрации кастомных обработчиков сообщений
    on(event, handler) {
        this.bot.on(event, handler);
    }

    // Получение статистики бота
    async getStats() {
        try {
            // Здесь можно добавить сбор статистики использования
            return {
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Ошибка получения статистики:', error);
            return null;
        }
    }
}

module.exports = TelegramBot;