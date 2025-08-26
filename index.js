require('dotenv').config();
const express = require('express');
const TelegramBot = require('./src/bot/bot');
const logger = require('./src/utils/logger');
const { getYandexLockbox } = require('./src/utils/yandex-lockbox');

// В index.js после строки 4 добавьте:
const GoogleSheetsService = require('./src/bot/services/google-sheets');
const UserService = require('./src/bot/services/user-service');
const ShiftService = require('./src/bot/services/shift-service');

class TelegramBotApp {
    constructor() {
        this.app = express();
        this.bot = null;
        this.sheetsService = null; // Добавьте это
        this.userService = null;   // Добавьте это  
        this.shiftService = null;  // Добавьте это
        this.port = process.env.PORT || 3000;
        this.isProduction = process.env.NODE_ENV === 'production';
        this.setupExpress();
    }

    // Настройка Express приложения
    setupExpress() {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // Health check endpoints
        this.setupHealthEndpoints();
        
        // Middleware для логирования запросов
        this.app.use((req, res, next) => {
            logger.http(req, res, Date.now());
            next();
        });
    }

    // Настройка health check эндпоинтов
    setupHealthEndpoints() {
        // Основной health check
        this.app.get('/', (req, res) => {
            res.json({
                status: 'OK',
                service: 'Telegram Statistics Bot',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                environment: process.env.NODE_ENV || 'development'
            });
        });

        // Детальный health check
        this.app.get('/health', async (req, res) => {
            try {
                const healthInfo = {
                    status: 'OK',
                    bot: this.bot ? 'running' : 'not_started',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    environment: process.env.NODE_ENV
                };

                // Проверяем доступность Yandex Lockbox
                try {
                    const lockboxHealth = await getYandexLockbox().healthCheck();
                    healthInfo.lockbox = lockboxHealth;
                } catch (lockboxError) {
                    healthInfo.lockbox = {
                        status: 'ERROR',
                        error: lockboxError.message
                    };
                }

                // Проверяем доступность бота
                if (this.bot) {
                    try {
                        const botHealth = await this.bot.healthCheck();
                        healthInfo.botDetails = botHealth;
                    } catch (botError) {
                        healthInfo.botDetails = {
                            status: 'ERROR',
                            error: botError.message
                        };
                    }
                }

                res.status(200).json(healthInfo);
            } catch (error) {
                logger.error('Ошибка health check:', error);
                res.status(500).json({
                    status: 'ERROR',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Статистика приложения
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = {
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    environment: process.env.NODE_ENV,
                    nodeVersion: process.version
                };

                if (this.bot) {
                    Object.assign(stats, await this.bot.getStats());
                }

                // Статистика Lockbox
                try {
                    const lockboxStats = getYandexLockbox().getStats();
                    stats.lockbox = lockboxStats;
                } catch (lockboxError) {
                    stats.lockbox = { error: lockboxError.message };
                }

                res.json(stats);
            } catch (error) {
                logger.error('Ошибка получения статистики:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Эндпоинт для перезагрузки бота
        this.app.post('/restart', async (req, res) => {
            if (!this.isProduction) {
                try {
                    await this.restartBot();
                    res.json({ status: 'restarting', timestamp: new Date().toISOString() });
                } catch (error) {
                    res.status(500).json({ error: error.message });
                }
            } else {
                res.status(403).json({ error: 'Restart not allowed in production' });
            }
        });

        // Эндпоинт для получения логов
        this.app.get('/logs', async (req, res) => {
            try {
                const format = req.query.format || 'text';
                const logs = logger.exportLogs(format);
                
                if (format === 'json') {
                    res.setHeader('Content-Type', 'application/json');
                } else {
                    res.setHeader('Content-Type', 'text/plain');
                }
                
                res.send(logs);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    // Инициализация бота
    // index.js - в методе initializeBot()
    async initializeBot() {
        try {
            logger.info('🚀 Инициализация Telegram бота...');
    
            const botToken = await this.getBotToken();
            if (!botToken) {
                throw new Error('BOT_TOKEN не найден.');
            }
    
            // Инициализируем сервисы
            this.sheetsService = new GoogleSheetsService();
            await this.sheetsService.connect();
            
            this.userService = new UserService(this.sheetsService);
            this.shiftService = new ShiftService(this.sheetsService);
    
            // Создаем бота
            this.bot = new TelegramBot(botToken);
            
            // ПЕРЕДАЕМ СЕРВИСЫ В ОБРАБОТЧИКИ - ИСПРАВЛЕННАЯ СТРОКА
            const { setupMainHandlers } = require('./src/bot/handlers/main');
            const { setupApplicationHandlers } = require('./src/bot/handlers/applications');
            const { setupAdminHandlers } = require('./src/bot/handlers/admin');
            
            // ПЕРЕДАЕМ this.bot.bot (экземпляр Telegraf), а не this.bot (вашу обертку)
            setupMainHandlers(this.bot.bot, this.userService);
            setupApplicationHandlers(this.bot.bot, this.shiftService, this.userService);
            setupAdminHandlers(this.bot.bot, this.userService, this.shiftService);
            
            logger.info('✅ Бот и сервисы инициализированы');
            return true;
    
        } catch (error) {
            logger.error('❌ Ошибка инициализации бота:', error);
            throw error;
        }
    }

    // Получение токена бота
    async getBotToken() {
        try {
            // Пробуем получить из Yandex Lockbox
            const lockbox = getYandexLockbox();
            const botToken = await lockbox.getSecret('BOT_TOKEN');
            
            if (botToken) {
                logger.info('✅ BOT_TOKEN получен из Yandex Lockbox');
                return botToken;
            }

            // Fallback на переменные окружения
            if (process.env.BOT_TOKEN) {
                logger.info('✅ BOT_TOKEN получен из переменных окружения');
                return process.env.BOT_TOKEN;
            }

            throw new Error('BOT_TOKEN не найден ни в одном источнике');

        } catch (error) {
            logger.error('❌ Ошибка получения BOT_TOKEN:', error);
            
            // Final fallback - возможно, для разработки
            if (process.env.BOT_TOKEN) {
                logger.warn('⚠️ Используется BOT_TOKEN из переменных окружения (fallback)');
                return process.env.BOT_TOKEN;
            }

            throw error;
        }
    }

    // Запуск бота в режиме polling
    async startPolling() {
        try {
            await this.bot.launch();
            logger.info('✅ Бот запущен в режиме polling');
            
            // Настраиваем graceful shutdown
            this.setupGracefulShutdown();
            
        } catch (error) {
            logger.error('❌ Ошибка запуска бота в режиме polling:', error);
            throw error;
        }
    }

    // Запуск бота в режиме webhook
    async startWebhook() {
        try {
            const domain = process.env.RENDER_EXTERNAL_URL || process.env.DOMAIN;
            
            if (!domain) {
                throw new Error('DOMAIN или RENDER_EXTERNAL_URL не настроены для webhook режима');
            }

            // Устанавливаем webhook
            await this.bot.telegram.setWebhook(`${domain}/telegram-webhook`);
            
            // Настраиваем обработчик webhook
            this.app.use(this.bot.webhookCallback('/telegram-webhook'));
            
            logger.info(`✅ Webhook установлен: ${domain}/telegram-webhook`);
            logger.info('✅ Бот запущен в режиме webhook');
            
            // Настраиваем graceful shutdown
            this.setupGracefulShutdown();
            
        } catch (error) {
            logger.error('❌ Ошибка запуска бота в режиме webhook:', error);
            throw error;
        }
    }

    // Запуск сервера
    async startServer() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, '0.0.0.0', () => {
                logger.info(`✅ Сервер запущен на порту ${this.port}`);
                logger.info(`📍 Health check доступен по http://localhost:${this.port}/health`);
                resolve();
            });

            this.server.on('error', (error) => {
                logger.error('❌ Ошибка запуска сервера:', error);
                reject(error);
            });
        });
    }

    // Основной метод запуска приложения
    async start() {
        try {
            logger.info('🎯 Запуск Telegram Bot Application...');
            logger.info(`🏭 Режим: ${this.isProduction ? 'production' : 'development'}`);

            // Инициализируем бота
            await this.initializeBot();

            // Запускаем сервер
            await this.startServer();

            // Запускаем бота в соответствующем режиме
            await this.startPolling();

            logger.info('🎉 Приложение успешно запущено!');
            this.logStartupInfo();

        } catch (error) {
            logger.error('💥 Критическая ошибка при запуске приложения:', error);
            process.exit(1);
        }
    }

    // Логирование информации о запуске
    logStartupInfo() {
        logger.info('\n' + '='.repeat(50));
        logger.info('🚀 TELEGRAM BOT APPLICATION STARTED');
        logger.info('='.repeat(50));
        logger.info(`📍 Port: ${this.port}`);
        logger.info(`🏭 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🤖 Bot mode: ${this.isProduction ? 'webhook' : 'polling'}`);
        logger.info(`📊 Log level: ${logger.getLevel()}`);
        logger.info('='.repeat(50) + '\n');
    }

    // Остановка приложения
    async stop(signal = 'SIGTERM') {
        logger.info(`🛑 Остановка приложения (${signal})...`);
        
        try {
            // Останавливаем бота
            if (this.bot) {
                this.bot.stop(signal);
            }

            // Останавливаем сервер
            if (this.server) {
                await new Promise((resolve) => {
                    this.server.close(() => {
                        logger.info('✅ Сервер остановлен');
                        resolve();
                    });
                });
            }

            logger.info('✅ Приложение остановлено');
            
        } catch (error) {
            logger.error('❌ Ошибка при остановке приложения:', error);
            throw error;
        }
    }

    // Перезагрузка бота
    async restartBot() {
        logger.info('🔄 Перезагрузка бота...');
        
        try {
            // Останавливаем текущий бот
            if (this.bot) {
                this.bot.stop('SIGUSR2');
            }
    
            // Переинициализируем бота
            await this.initializeBot();
            
            // Запускаем в соответствующем режиме
            if (this.isProduction) {
                await this.startWebhook();
            } else {
                await this.startPolling();
            }
    
            logger.info('✅ Бот перезагружен');
            return true;
            
        } catch (error) {
            logger.error('❌ Ошибка перезагрузки бота:', error);
            throw error;
        }
    }

    // Настройка graceful shutdown
    setupGracefulShutdown() {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        
        signals.forEach(signal => {
            process.on(signal, async () => {
                logger.info(`\n${signal} получен, начинаем graceful shutdown...`);
                
                try {
                    await this.stop(signal);
                    process.exit(0);
                } catch (error) {
                    logger.error('❌ Ошибка graceful shutdown:', error);
                    process.exit(1);
                }
            });
        });

        // Обработка необработанных исключений
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('❌ Необработанный промис:', reason);
        });

        process.on('uncaughtException', (error) => {
            logger.error('❌ Непойманное исключение:', error);
            process.exit(1);
        });
    }

    // Получение статистики приложения
    async getAppStats() {
        const stats = {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV
        };

        if (this.bot) {
            Object.assign(stats, await this.bot.getStats());
        }

        return stats;
    }
}

// Создание и запуск приложения
async function main() {
    const app = new TelegramBotApp();
    
    try {
        await app.start();
    } catch (error) {
        console.error('💥 Failed to start application:', error);
        process.exit(1);
    }
}

// Обработка аргументов командной строки
function handleCliArgs() {
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
🚀 Telegram Bot Application

Usage:
  node index.js [options]

Options:
  --help, -h      Show this help
  --version, -v   Show version
  --stats         Show application stats
  --health        Run health check
  --test          Test configuration

Environment variables:
  BOT_TOKEN       Telegram bot token
  PORT            Server port (default: 3000)
  NODE_ENV        Environment (development/production)
        `);
        process.exit(0);
    }

    if (args.includes('--version') || args.includes('-v')) {
        console.log('Telegram Bot Application v1.0.0');
        process.exit(0);
    }
}

// Запуск приложения
if (require.main === module) {
    handleCliArgs();
    main().catch(error => {
        console.error('💥 Failed to start application:', error);
        process.exit(1);
    });
}

// Экспорт для тестирования
module.exports = {
    TelegramBotApp,
    main
};