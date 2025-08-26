const axios = require('axios');
const { logger } = require('./logger');
const fs = require('fs').promises;
const path = require('path');

class YandexLockbox {
    constructor() {
        this.iamToken = process.env.IAM_TOKEN;
        this.oauthToken = process.env.OAUTH_TOKEN;
        this.folderId = process.env.FOLDER_ID;
        this.lockboxEndpoint = 'https://lockbox.api.cloud.yandex.net/lockbox/v1/secrets';
        this.iamEndpoint = 'https://iam.api.cloud.yandex.net/iam/v1/tokens';
        
        this.cache = new Map();
        this.cacheTtl = 5 * 60 * 1000; // 5 минут кэширования
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        
        this.initialize();
    }

    // Инициализация сервиса
    initialize() {
        this.setupCacheCleanup();
        this.validateConfiguration();
    }

    // Проверка конфигурации
    validateConfiguration() {
        if (!this.iamToken && !this.oauthToken) {
            logger.warn('Yandex Lockbox: Не настроены IAM_TOKEN или OAUTH_TOKEN. Будет использоваться локальное хранение секретов.');
        }

        if (!this.folderId) {
            logger.warn('Yandex Lockbox: Не настроен FOLDER_ID. Некоторые операции могут не работать.');
        }
    }

    // Получение IAM токена через OAuth
    async getIamTokenFromOAuth() {
        if (!this.oauthToken) {
            throw new Error('OAUTH_TOKEN не настроен');
        }

        try {
            const response = await axios.post(this.iamEndpoint, {
                yandexPassportOauthToken: this.oauthToken
            }, {
                timeout: 10000
            });

            this.iamToken = response.data.iamToken;
            logger.debug('Yandex Lockbox: IAM токен получен через OAuth');
            
            return this.iamToken;
        } catch (error) {
            logger.error('Yandex Lockbox: Ошибка получения IAM токена:', error);
            throw error;
        }
    }

    // Получение актуального IAM токена
    async getValidIamToken() {
        if (this.iamToken) {
            return this.iamToken;
        }

        if (this.oauthToken) {
            return await this.getIamTokenFromOAuth();
        }

        throw new Error('Не настроены аутентификационные токены для Yandex Lockbox');
    }

    // Создание HTTP клиента с авторизацией
    async createAuthorizedClient() {
        const token = await this.getValidIamToken();
        
        return axios.create({
            baseURL: this.lockboxEndpoint,
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    }

    // Получение секрета из Lockbox
    async getSecret(secretName, secretId = null) {
        try {
            // Проверяем кэш
            const cacheKey = secretId || secretName;
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                logger.debug(`Yandex Lockbox: Секрет ${secretName} получен из кэша`);
                return cached;
            }

            // Если не указан secretId, используем переменную окружения или ищем по имени
            const targetSecretId = secretId || process.env.LOCKBOX_SECRET_ID;
            
            if (!targetSecretId) {
                logger.warn('Yandex Lockbox: LOCKBOX_SECRET_ID не настроен, пробуем найти секрет по имени');
                return await this.getSecretByName(secretName);
            }

            const client = await this.createAuthorizedClient();
            
            const response = await this.retryRequest(() => 
                client.get(`/${targetSecretId}/payload`)
            );

            const secretEntry = response.data.entries.find(entry => entry.key === secretName);
            
            if (!secretEntry) {
                logger.warn(`Yandex Lockbox: Секрет ${secretName} не найден в Lockbox`);
                return null;
            }

            const value = secretEntry.textValue || secretEntry.binaryValue;
            
            // Сохраняем в кэш
            this.saveToCache(cacheKey, value);
            
            logger.debug(`Yandex Lockbox: Секрет ${secretName} успешно получен`);
            return value;

        } catch (error) {
            return await this.handleSecretError(secretName, error);
        }
    }

    // Поиск секрета по имени (если не известен ID)
    async getSecretByName(secretName) {
        try {
            const client = await this.createAuthorizedClient();
            
            // Получаем список всех секретов
            const response = await this.retryRequest(() =>
                client.get('', {
                    params: {
                        folderId: this.folderId
                    }
                })
            );

            // Ищем секрет с нужным именем
            const secret = response.data.secrets.find(s => 
                s.name.toLowerCase().includes(secretName.toLowerCase())
            );

            if (!secret) {
                logger.warn(`Yandex Lockbox: Секрет с именем содержащим ${secretName} не найден`);
                return null;
            }

            // Получаем payload найденного секрета
            const payloadResponse = await this.retryRequest(() =>
                client.get(`/${secret.id}/payload`)
            );

            const secretEntry = payloadResponse.data.entries.find(entry => entry.key === secretName);
            
            if (!secretEntry) {
                logger.warn(`Yandex Lockbox: Ключ ${secretName} не найден в секрете ${secret.name}`);
                return null;
            }

            const value = secretEntry.textValue || secretEntry.binaryValue;
            this.saveToCache(secretName, value);
            
            logger.debug(`Yandex Lockbox: Секрет ${secretName} найден через поиск по имени`);
            return value;

        } catch (error) {
            return await this.handleSecretError(secretName, error);
        }
    }

    // Получение нескольких секретов
    async getSecrets(secretNames, secretId = null) {
        const results = {};
        
        for (const secretName of secretNames) {
            try {
                const value = await this.getSecret(secretName, secretId);
                results[secretName] = value;
            } catch (error) {
                logger.error(`Yandex Lockbox: Ошибка получения секрета ${secretName}:`, error);
                results[secretName] = null;
            }
        }
        
        return results;
    }

    // Создание нового секрета
    async createSecret(secretName, secretValue, description = '') {
        try {
            if (!this.folderId) {
                throw new Error('FOLDER_ID не настроен для создания секретов');
            }

            const client = await this.createAuthorizedClient();
            
            const payload = {
                folderId: this.folderId,
                name: secretName,
                description: description,
                versionPayload: {
                    entries: [{
                        key: secretName,
                        textValue: secretValue
                    }]
                }
            };

            const response = await this.retryRequest(() =>
                client.post('', payload)
            );

            logger.info(`Yandex Lockbox: Секрет ${secretName} успешно создан`);
            return response.data;

        } catch (error) {
            logger.error('Yandex Lockbox: Ошибка создания секрета:', error);
            throw error;
        }
    }

    // Добавление версии к существующему секрету
    async addSecretVersion(secretId, secretName, secretValue) {
        try {
            const client = await this.createAuthorizedClient();
            
            const payload = {
                entries: [{
                    key: secretName,
                    textValue: secretValue
                }]
            };

            const response = await this.retryRequest(() =>
                client.post(`/${secretId}/versions`, payload)
            );

            logger.info(`Yandex Lockbox: Версия добавлена к секрету ${secretId}`);
            return response.data;

        } catch (error) {
            logger.error('Yandex Lockbox: Ошибка добавления версии секрета:', error);
            throw error;
        }
    }

    // Получение списка всех секретов
    async listSecrets() {
        try {
            if (!this.folderId) {
                throw new Error('FOLDER_ID не настроен для получения списка секретов');
            }

            const client = await this.createAuthorizedClient();
            
            const response = await this.retryRequest(() =>
                client.get('', {
                    params: {
                        folderId: this.folderId
                    }
                })
            );

            return response.data.secrets;

        } catch (error) {
            logger.error('Yandex Lockbox: Ошибка получения списка секретов:', error);
            throw error;
        }
    }

    // Удаление секрета
    async deleteSecret(secretId) {
        try {
            const client = await this.createAuthorizedClient();
            
            await this.retryRequest(() =>
                client.delete(`/${secretId}`)
            );

            logger.info(`Yandex Lockbox: Секрет ${secretId} удален`);
            return true;

        } catch (error) {
            logger.error('Yandex Lockbox: Ошибка удаления секрета:', error);
            throw error;
        }
    }

    // Обработка ошибок при получении секретов
    async handleSecretError(secretName, error) {
        if (error.response) {
            // Ошибка от API Yandex
            const status = error.response.status;
            
            if (status === 404) {
                logger.warn(`Yandex Lockbox: Секрет ${secretName} не найден (404)`);
            } else if (status === 403) {
                logger.error('Yandex Lockbox: Доступ запрещен. Проверьте права доступа IAM роли');
            } else if (status === 401) {
                logger.error('Yandex Lockbox: Неавторизованный доступ. Проверьте IAM токен');
            } else {
                logger.error(`Yandex Lockbox: Ошибка API (${status}):`, error.response.data);
            }
        } else if (error.request) {
            // Ошибка сети
            logger.error('Yandex Lockbox: Ошибка сети при запросе к Lockbox:', error.message);
        } else {
            // Другие ошибки
            logger.error('Yandex Lockbox: Неизвестная ошибка:', error.message);
        }

        // Пробуем получить значение из fallback источников
        return await this.getSecretFallback(secretName);
    }

    // Fallback: получение секрета из альтернативных источников
    async getSecretFallback(secretName) {
        logger.debug(`Yandex Lockbox: Попытка fallback для секрета ${secretName}`);
        
        // 1. Проверяем переменные окружения
        const envValue = process.env[secretName];
        if (envValue) {
            logger.debug(`Yandex Lockbox: Секрет ${secretName} получен из переменных окружения`);
            return envValue;
        }

        // 2. Проверяем локальный файл с секретами
        try {
            const localSecrets = await this.loadLocalSecrets();
            if (localSecrets[secretName]) {
                logger.debug(`Yandex Lockbox: Секрет ${secretName} получен из локального файла`);
                return localSecrets[secretName];
            }
        } catch (error) {
            logger.debug('Yandex Lockbox: Локальный файл секретов не доступен:', error.message);
        }

        // 3. Проверяем зашитые значения по умолчанию
        const defaultSecrets = this.getDefaultSecrets();
        if (defaultSecrets[secretName]) {
            logger.debug(`Yandex Lockbox: Секрет ${secretName} получен из значений по умолчанию`);
            return defaultSecrets[secretName];
        }

        logger.warn(`Yandex Lockbox: Секрет ${secretName} не найден ни в одном источнике`);
        return null;
    }

    // Загрузка локальных секретов из файла
    async loadLocalSecrets() {
        try {
            const secretsPath = path.join(process.cwd(), 'secrets.json');
            const data = await fs.readFile(secretsPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    // Значения секретов по умолчанию (для разработки)
    getDefaultSecrets() {
        return {
            'BOT_TOKEN': process.env.BOT_TOKEN || null,
            'SPREADSHEET_ID': process.env.SPREADSHEET_ID || null,
            'SUPER_ADMIN_ID': process.env.SUPER_ADMIN_ID || '566632489'
        };
    }

    // Повторяющийся запрос с retry
    async retryRequest(requestFn, attempt = 1) {
        try {
            return await requestFn();
        } catch (error) {
            if (attempt >= this.retryAttempts) {
                throw error;
            }

            const delay = this.retryDelay * Math.pow(2, attempt - 1);
            logger.debug(`Yandex Lockbox: Повтор запроса (попытка ${attempt + 1}) через ${delay}ms`);
            
            await this.delay(delay);
            return await this.retryRequest(requestFn, attempt + 1);
        }
    }

    // Задержка
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Управление кэшем
    saveToCache(key, value) {
        this.cache.set(key, {
            value: value,
            timestamp: Date.now()
        });
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;

        if (Date.now() - cached.timestamp > this.cacheTtl) {
            this.cache.delete(key);
            return null;
        }

        return cached.value;
    }

    clearCache() {
        this.cache.clear();
        logger.debug('Yandex Lockbox: Кэш очищен');
    }

    // Периодическая очистка кэша
    setupCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, value] of this.cache.entries()) {
                if (now - value.timestamp > this.cacheTtl) {
                    this.cache.delete(key);
                }
            }
        }, this.cacheTtl);
    }

    // Проверка доступности Yandex Lockbox
    async healthCheck() {
        try {
            const client = await this.createAuthorizedClient();
            await client.get('', { params: { folderId: this.folderId, pageSize: 1 } });
            
            return {
                status: 'healthy',
                service: 'yandex_lockbox',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                service: 'yandex_lockbox',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Получение статистики
    getStats() {
        return {
            cacheSize: this.cache.size,
            cacheTtl: this.cacheTtl,
            hasIamToken: !!this.iamToken,
            hasOauthToken: !!this.oauthToken,
            hasFolderId: !!this.folderId,
            timestamp: new Date().toISOString()
        };
    }
}

// Создание singleton instance
let lockboxInstance = null;

function getYandexLockbox() {
    if (!lockboxInstance) {
        lockboxInstance = new YandexLockbox();
    }
    return lockboxInstance;
}

// Функция для быстрого доступа к секретам
async function getSecret(secretName, secretId = null) {
    const lockbox = getYandexLockbox();
    return await lockbox.getSecret(secretName, secretId);
}

// Функция для получения нескольких секретов
async function getSecrets(secretNames, secretId = null) {
    const lockbox = getYandexLockbox();
    return await lockbox.getSecrets(secretNames, secretId);
}

module.exports = {
    // Singleton instance
    getYandexLockbox,
    
    // Быстрые методы доступа
    getSecret,
    getSecrets,
    
    // Класс для расширенного использования
    YandexLockbox
};