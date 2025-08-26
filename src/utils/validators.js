const logger = require('./logger');

class Validators {
    // Валидация ФИО
    static validateFIO(fio) {
        if (!fio || typeof fio !== 'string') {
            return false;
        }

        const trimmedFio = fio.trim();
        
        // Проверяем длину
        if (trimmedFio.length < 5 || trimmedFio.length > 100) {
            logger.debug(`Невалидная длина ФИО: ${trimmedFio.length}`);
            return false;
        }

        // Разбиваем на части
        const parts = trimmedFio.split(/\s+/);
        
        // Должно быть минимум 2 части (Фамилия Имя)
        if (parts.length < 2 || parts.length > 4) {
            logger.debug(`Невалидное количество частей ФИО: ${parts.length}`);
            return false;
        }

        // Проверяем каждую часть
        for (const part of parts) {
            // Русские и английские буквы, дефисы, апострофы
            if (!/^[A-Za-zА-Яа-яЁё\-']+$/.test(part)) {
                logger.debug(`Невалидные символы в ФИО: ${part}`);
                return false;
            }
            
            // Минимальная длина каждой части
            if (part.length < 2) {
                logger.debug(`Слишком короткая часть ФИО: ${part}`);
                return false;
            }
            
            // Первая буква должна быть заглавной (для русских и английских)
            if (!/^[A-ZА-ЯЁ]/.test(part)) {
                logger.debug(`Первая буква не заглавная: ${part}`);
                return false;
            }
        }

        logger.debug(`Валидное ФИО: ${trimmedFio}`);
        return true;
    }

    // Нормализация ФИО
    static normalizeFIO(fio) {
        if (!this.validateFIO(fio)) {
            return null;
        }

        const trimmedFio = fio.trim();
        const parts = trimmedFio.split(/\s+/);
        
        // Приводим к правильному регистру: Иванов иван иванович -> Иванов Иван Иванович
        const normalizedParts = parts.map(part => {
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        });

        return normalizedParts.join(' ');
    }

    // Валидация email
    static validateEmail(email) {
        if (!email || typeof email !== 'string') {
            return false;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const isValid = emailRegex.test(email.trim());
        
        if (!isValid) {
            logger.debug(`Невалидный email: ${email}`);
        }
        
        return isValid;
    }

    // Валидация телефона
    static validatePhone(phone) {
        if (!phone || typeof phone !== 'string') {
            return false;
        }

        // Убираем все нецифровые символы
        const cleaned = phone.replace(/\D/g, '');
        
        // Российские номера: +7, 8, 7
        const isValid = cleaned.length === 11 && 
                       (cleaned.startsWith('7') || cleaned.startsWith('8'));
        
        if (!isValid) {
            logger.debug(`Невалидный телефон: ${phone}`);
        }
        
        return isValid;
    }

    // Нормализация телефона
    static normalizePhone(phone) {
        if (!this.validatePhone(phone)) {
            return null;
        }

        const cleaned = phone.replace(/\D/g, '');
        // Приводим к формату +7XXXXXXXXXX
        return '+7' + cleaned.slice(cleaned.length - 10);
    }

    // Валидация даты (формат ДД.ММ.ГГГГ)
    static validateDate(dateString) {
        if (!dateString || typeof dateString !== 'string') {
            return false;
        }

        const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
        const match = dateString.match(dateRegex);
        
        if (!match) {
            logger.debug(`Невалидный формат даты: ${dateString}`);
            return false;
        }

        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);

        // Проверяем валидность даты
        if (month < 1 || month > 12) {
            logger.debug(`Невалидный месяц: ${month}`);
            return false;
        }

        if (day < 1 || day > 31) {
            logger.debug(`Невалидный день: ${day}`);
            return false;
        }

        // Проверяем конкретные месяцы
        if ((month === 4 || month === 6 || month === 9 || month === 11) && day > 30) {
            logger.debug(`В месяце ${month} не может быть больше 30 дней`);
            return false;
        }

        // Февраль и високосный год
        if (month === 2) {
            const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
            if (day > (isLeapYear ? 29 : 28)) {
                logger.debug(`Невалидный день в феврале: ${day}`);
                return false;
            }
        }

        // Дата не должна быть в будущем (опционально)
        const inputDate = new Date(year, month - 1, day);
        const today = new Date();
        if (inputDate > today) {
            logger.debug(`Дата в будущем: ${dateString}`);
            return false;
        }

        logger.debug(`Валидная дата: ${dateString}`);
        return true;
    }

    // Валидация времени (формат ЧЧ:ММ-ЧЧ:ММ)
    static validateTime(timeString) {
        if (!timeString || typeof timeString !== 'string') {
            return false;
        }

        const timeRegex = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;
        const match = timeString.match(timeRegex);
        
        if (!match) {
            logger.debug(`Невалидный формат времени: ${timeString}`);
            return false;
        }

        const startHours = parseInt(match[1], 10);
        const startMinutes = parseInt(match[2], 10);
        const endHours = parseInt(match[3], 10);
        const endMinutes = parseInt(match[4], 10);

        // Проверяем валидность времени
        if (startHours < 0 || startHours > 23 || endHours < 0 || endHours > 23) {
            logger.debug(`Невалидные часы: ${startHours}-${endHours}`);
            return false;
        }

        if (startMinutes < 0 || startMinutes > 59 || endMinutes < 0 || endMinutes > 59) {
            logger.debug(`Невалидные минуты: ${startMinutes}-${endMinutes}`);
            return false;
        }

        // Время окончания должно быть после времени начала
        const startTotal = startHours * 60 + startMinutes;
        const endTotal = endHours * 60 + endMinutes;
        
        if (endTotal <= startTotal) {
            logger.debug(`Время окончания раньше начала: ${timeString}`);
            return false;
        }

        // Минимальная продолжительность смены - 1 час
        if (endTotal - startTotal < 60) {
            logger.debug(`Слишком короткая смена: ${timeString}`);
            return false;
        }

        logger.debug(`Валидное время: ${timeString}`);
        return true;
    }

    // Валидация отдела/подразделения
    static validateDepartment(department) {
        if (!department || typeof department !== 'string') {
            return false;
        }

        const trimmed = department.trim();
        
        // Минимальная и максимальная длина
        if (trimmed.length < 2 || trimmed.length > 50) {
            logger.debug(`Невалидная длина отдела: ${trimmed.length}`);
            return false;
        }

        // Разрешенные символы: буквы, цифры, пробелы, дефисы
        if (!/^[A-Za-zА-Яа-яЁё0-9\s\-]+$/.test(trimmed)) {
            logger.debug(`Невалидные символы в отделе: ${trimmed}`);
            return false;
        }

        logger.debug(`Валидный отдел: ${trimmed}`);
        return true;
    }

    // Валидация количества людей
    static validatePeopleCount(count) {
        if (count === null || count === undefined) {
            return false;
        }

        const num = typeof count === 'string' ? parseInt(count, 10) : count;
        
        if (isNaN(num) || num < 1 || num > 100) {
            logger.debug(`Невалидное количество людей: ${count}`);
            return false;
        }

        logger.debug(`Валидное количество людей: ${num}`);
        return true;
    }

    // Валидация ID пользователя
    static validateUserId(userId) {
        if (userId === null || userId === undefined) {
            return false;
        }

        const num = typeof userId === 'string' ? parseInt(userId, 10) : userId;
        
        if (isNaN(num) || num <= 0 || num > 9999999999) {
            logger.debug(`Невалидный ID пользователя: ${userId}`);
            return false;
        }

        logger.debug(`Валидный ID пользователя: ${num}`);
        return true;
    }

    // Валидация ID смены
    static validateShiftId(shiftId) {
        if (shiftId === null || shiftId === undefined) {
            return false;
        }

        const num = typeof shiftId === 'string' ? parseInt(shiftId, 10) : shiftId;
        
        if (isNaN(num) || num <= 0) {
            logger.debug(`Невалидный ID смены: ${shiftId}`);
            return false;
        }

        logger.debug(`Валидный ID смены: ${num}`);
        return true;
    }

    // Валидация статуса смены
    static validateShiftStatus(status) {
        const validStatuses = ['active', 'completed', 'inactive', 'pending'];
        const isValid = validStatuses.includes(status);
        
        if (!isValid) {
            logger.debug(`Невалидный статус смены: ${status}`);
        }
        
        return isValid;
    }

    // Валидация статуса заявки
    static validateApplicationStatus(status) {
        const validStatuses = ['approved', 'pending', 'rejected', 'signed'];
        const isValid = validStatuses.includes(status);
        
        if (!isValid) {
            logger.debug(`Невалидный статус заявки: ${status}`);
        }
        
        return isValid;
    }

    // Валидация данных для создания смены
    static validateShiftData(shiftData) {
        const errors = [];
        
        if (!shiftData) {
            return ['Данные смены не предоставлены'];
        }

        if (!this.validateDate(shiftData.date)) {
            errors.push('Неверный формат даты. Используйте ДД.ММ.ГГГГ');
        }

        if (!this.validateTime(shiftData.time)) {
            errors.push('Неверный формат времени. Используйте ЧЧ:ММ-ЧЧ:ММ');
        }

        if (!this.validateDepartment(shiftData.department)) {
            errors.push('Отдел должен содержать от 2 до 50 символов (только буквы, цифры, пробелы и дефисы)');
        }

        if (!this.validatePeopleCount(shiftData.requiredPeople)) {
            errors.push('Количество человек должно быть числом от 1 до 100');
        }

        if (errors.length > 0) {
            logger.debug(`Ошибки валидации смены: ${errors.join(', ')}`);
        }

        return errors;
    }

    // Валидация данных пользователя
    static validateUserData(userData) {
        const errors = [];
        
        if (!userData) {
            return ['Данные пользователя не предоставлены'];
        }

        if (!this.validateFIO(userData.fio)) {
            errors.push('Неверный формат ФИО. Используйте: Фамилия Имя Отчество');
        }

        if (userData.userId && !this.validateUserId(userData.userId)) {
            errors.push('Неверный формат ID пользователя');
        }

        return errors;
    }

    // Валидация данных заявки
    static validateApplicationData(appData) {
        const errors = [];
        
        if (!appData) {
            return ['Данные заявки не предоставлены'];
        }

        if (!this.validateShiftId(appData.shiftId)) {
            errors.push('Неверный ID смены');
        }

        if (!appData.userName || typeof appData.userName !== 'string') {
            errors.push('Не указано имя пользователя');
        }

        return errors;
    }

    // Валидация пароля
    static validatePassword(password) {
        if (!password || typeof password !== 'string') {
            return false;
        }

        // Минимальная длина
        if (password.length < 8) {
            logger.debug('Пароль слишком короткий');
            return false;
        }

        // Должен содержать буквы и цифры
        if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
            logger.debug('Пароль должен содержать буквы и цифры');
            return false;
        }

        logger.debug('Валидный пароль');
        return true;
    }

    // Валидация JSON строки
    static validateJSON(jsonString) {
        try {
            JSON.parse(jsonString);
            return true;
        } catch (error) {
            logger.debug('Невалидный JSON:', error.message);
            return false;
        }
    }

    // Валидация URL
    static validateURL(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }

        try {
            new URL(url);
            return true;
        } catch (error) {
            logger.debug('Невалидный URL:', error.message);
            return false;
        }
    }

    // Валидация числового диапазона
    static validateNumberRange(value, min, max) {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        
        if (isNaN(num) || num < min || num > max) {
            logger.debug(`Число ${value} вне диапазона ${min}-${max}`);
            return false;
        }

        return true;
    }

    // Валидация длины строки
    static validateStringLength(str, min, max) {
        if (!str || typeof str !== 'string') {
            return false;
        }

        const length = str.trim().length;
        if (length < min || length > max) {
            logger.debug(`Длина строки ${length} вне диапазона ${min}-${max}`);
            return false;
        }

        return true;
    }

    // Валидация массива
    static validateArray(arr, minLength = 0, maxLength = Infinity) {
        if (!Array.isArray(arr)) {
            return false;
        }

        if (arr.length < minLength || arr.length > maxLength) {
            logger.debug(`Длина массива ${arr.length} вне диапазона ${minLength}-${maxLength}`);
            return false;
        }

        return true;
    }

    // Валидация объекта
    static validateObject(obj, requiredFields = []) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return false;
        }

        for (const field of requiredFields) {
            if (!obj.hasOwnProperty(field)) {
                logger.debug(`Отсутствует обязательное поле: ${field}`);
                return false;
            }
        }

        return true;
    }

    // Санитизация строки (очистка от опасных символов)
    static sanitizeString(input) {
        if (!input || typeof input !== 'string') {
            return '';
        }

        // Убираем HTML теги
        let sanitized = input.replace(/<[^>]*>/g, '');
        
        // Экранируем специальные символы
        sanitized = sanitized.replace(/[&<>"']/g, function(m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;'
            }[m];
        });

        // Обрезаем пробелы
        sanitized = sanitized.trim();
        
        // Ограничиваем длину
        if (sanitized.length > 1000) {
            sanitized = sanitized.substring(0, 1000);
        }

        return sanitized;
    }

    // Санитизация числа
    static sanitizeNumber(input, defaultValue = 0) {
        if (input === null || input === undefined) {
            return defaultValue;
        }

        const num = typeof input === 'string' ? parseFloat(input) : input;
        return isNaN(num) ? defaultValue : num;
    }

    // Санитизация булевого значения
    static sanitizeBoolean(input, defaultValue = false) {
        if (input === null || input === undefined) {
            return defaultValue;
        }

        if (typeof input === 'boolean') {
            return input;
        }

        if (typeof input === 'string') {
            const lower = input.toLowerCase();
            return lower === 'true' || lower === '1' || lower === 'yes';
        }

        if (typeof input === 'number') {
            return input !== 0;
        }

        return Boolean(input);
    }

    // Генерация хэша для валидации (простая реализация)
    static generateValidationHash(data) {
        if (!data) return '';
        
        const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
        let hash = 0;
        
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return Math.abs(hash).toString(16);
    }

    // Проверка хэша
    static validateHash(data, expectedHash) {
        const actualHash = this.generateValidationHash(data);
        return actualHash === expectedHash;
    }

    // Валидация кода подтверждения
    static validateVerificationCode(code, length = 6) {
        if (!code || typeof code !== 'string') {
            return false;
        }

        const codeRegex = new RegExp(`^\\d{${length}}$`);
        return codeRegex.test(code);
    }

    // Валидация роли пользователя
    static validateUserRole(role) {
        const validRoles = ['user', 'admin', 'moderator', 'superadmin'];
        return validRoles.includes(role);
    }

    // Валидация разрешений
    static validatePermissions(permissions) {
        if (!Array.isArray(permissions)) {
            return false;
        }

        const validPermissions = ['read', 'write', 'delete', 'manage', 'admin'];
        return permissions.every(perm => validPermissions.includes(perm));
    }
}

// Экспорт функций для обратной совместимости
module.exports = {
    // Основные валидаторы
    validateFIO: Validators.validateFIO,
    normalizeFIO: Validators.normalizeFIO,
    validateEmail: Validators.validateEmail,
    validatePhone: Validators.validatePhone,
    normalizePhone: Validators.normalizePhone,
    validateDate: Validators.validateDate,
    validateTime: Validators.validateTime,
    validateDepartment: Validators.validateDepartment,
    validatePeopleCount: Validators.validatePeopleCount,
    validateUserId: Validators.validateUserId,
    validateShiftId: Validators.validateShiftId,
    validateShiftStatus: Validators.validateShiftStatus,
    validateApplicationStatus: Validators.validateApplicationStatus,
    
    // Комплексные валидаторы
    validateShiftData: Validators.validateShiftData,
    validateUserData: Validators.validateUserData,
    validateApplicationData: Validators.validateApplicationData,
    
    // Общие валидаторы
    validatePassword: Validators.validatePassword,
    validateJSON: Validators.validateJSON,
    validateURL: Validators.validateURL,
    validateNumberRange: Validators.validateNumberRange,
    validateStringLength: Validators.validateStringLength,
    validateArray: Validators.validateArray,
    validateObject: Validators.validateObject,
    
    // Санитизация
    sanitizeString: Validators.sanitizeString,
    sanitizeNumber: Validators.sanitizeNumber,
    sanitizeBoolean: Validators.sanitizeBoolean,
    
    // Утилиты
    generateValidationHash: Validators.generateValidationHash,
    validateHash: Validators.validateHash,
    validateVerificationCode: Validators.validateVerificationCode,
    validateUserRole: Validators.validateUserRole,
    validatePermissions: Validators.validatePermissions,
    
    // Экспорт класса для расширенного использования
    Validators
};