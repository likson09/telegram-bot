/**
 * Утилиты для форматирования данных в боте
 */

class Formatters {
    // Форматирование даты в короткий формат
    static formatDateShort(dateString) {
        if (!dateString) return '??.??';
        
        try {
            // Пробуем разные форматы дат
            if (dateString.includes('.')) {
                const parts = dateString.split('.');
                if (parts.length >= 2) {
                    return `${parts[0]}.${parts[1]}`; // ДД.ММ
                }
            } else if (dateString.includes('-')) {
                const parts = dateString.split('-');
                if (parts.length >= 2) {
                    return `${parts[2]}.${parts[1]}`; // ГГГГ-ММ-ДД -> ДД.ММ
                }
            } else if (dateString.includes('/')) {
                const parts = dateString.split('/');
                if (parts.length >= 2) {
                    return `${parts[1]}.${parts[0]}`; // ММ/ДД -> ДД.ММ
                }
            }
            
            return dateString.slice(0, 5); // Первые 5 символов
        } catch {
            return dateString.slice(0, 5);
        }
    }

    // Форматирование времени (только начало)
    static formatTime(timeString) {
        if (!timeString) return '??:??';
        
        try {
            // Берем только время начала (до дефиса)
            return timeString.split('-')[0].trim();
        } catch {
            return timeString.slice(0, 5);
        }
    }

    // Форматирование отдела/подразделения
    static formatDepartment(dept) {
        if (!dept) return '???';
        
        const shortNames = {
            'склад': 'СКЛ',
            'торговый зал': 'ТЗ',
            'касса': 'КС',
            'кладовая': 'КЛ',
            'приемка': 'ПР',
            'выдача': 'ВД',
            'логистика': 'ЛГ',
            'администрация': 'АДМ',
            'мерчандайзинг': 'МЧ',
            'операционный': 'ОП'
        };
        
        const lowerDept = dept.toLowerCase().trim();
        return shortNames[lowerDept] || dept.slice(0, 3).toUpperCase();
    }

    // Сокращение ФИО
    static truncateName(fullName, maxLength = 15) {
        if (!fullName) return '???';
        
        const parts = fullName.trim().split(' ');
        
        if (parts.length >= 3) {
            // Иванов И.И.
            return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
        }
        if (parts.length === 2) {
            // Иванов И.
            return `${parts[0]} ${parts[1][0]}.`;
        }
        
        // Обрезаем если слишком длинное
        return fullName.length > maxLength ? 
            fullName.slice(0, maxLength - 1) + '…' : fullName;
    }

    // Умное форматирование текста для телеграма
    static smartText(text, maxLength = 20) {
        if (!text) return '';
        
        // Заменяем длинные слова на сокращения
        const replacements = {
            'подработк': 'подр-ка',
            'администратор': 'админ',
            'подтвержден': 'подтв.',
            'ожидает': 'ждет',
            'статистика': 'стат-ка',
            'производительность': 'пр-сть',
            'управление': 'упр-ние',
            'количество': 'кол-во',
            'дополнительный': 'доп.',
            'подтверждение': 'подтв.',
            'расписание': 'распис.',
            'информация': 'инфо',
            'уведомление': 'уведом.',
            'приложение': 'прил.',
            'конфигурация': 'конфиг'
        };
        
        let result = text;
        
        // Заменяем длинные слова
        for (const [long, short] of Object.entries(replacements)) {
            result = result.replace(new RegExp(long, 'gi'), short);
        }
        
        // Обрезаем если все еще слишком длинное
        if (result.length > maxLength) {
            return result.slice(0, maxLength - 1) + '…';
        }
        
        return result;
    }

    // Форматирование чисел с разделителями
    static formatNumber(number) {
        if (number === null || number === undefined) return '0';
        return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }

    // Форматирование процентов
    static formatPercent(value, total) {
        if (!total || total === 0) return '0%';
        const percentage = Math.round((value / total) * 100);
        return `${percentage}%`;
    }

    // Форматирование временного интервала
    static formatTimeRange(start, end) {
        if (!start || !end) return '??:??-??:??';
        return `${this.formatTime(start)}-${this.formatTime(end)}`;
    }

    // Форматирование даты и времени
    static formatDateTime(dateString, timeString) {
        return `${this.formatDateShort(dateString)} ${this.formatTime(timeString)}`;
    }

    // Форматирование статуса смены
    static formatShiftStatus(status) {
        const statusMap = {
            'active': '✅ Активна',
            'completed': '🏁 Завершена',
            'inactive': '⚫ Неактивна',
            'pending': '⏳ Ожидание'
        };
        
        return statusMap[status] || status;
    }

    // Форматирование статуса заявки
    static formatApplicationStatus(status) {
        const statusMap = {
            'approved': '✅ Подтверждена',
            'pending': '⏳ Ожидает',
            'rejected': '❌ Отклонена',
            'signed': '📝 Записана'
        };
        
        return statusMap[status] || status;
    }

    // Форматирование длинного текста с переносами
    static formatLongText(text, maxLineLength = 40) {
        if (!text) return '';
        
        const words = text.split(' ');
        let currentLine = '';
        const lines = [];
        
        for (const word of words) {
            if ((currentLine + word).length > maxLineLength) {
                lines.push(currentLine);
                currentLine = word + ' ';
            } else {
                currentLine += word + ' ';
            }
        }
        
        if (currentLine) {
            lines.push(currentLine);
        }
        
        return lines.join('\n');
    }

    // Форматирование размера файла
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Форматирование времени в относительный формат
    static formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        
        if (minutes < 1) return 'только что';
        if (minutes < 60) return `${minutes} мин назад`;
        if (hours < 24) return `${hours} ч назад`;
        if (days < 7) return `${days} д назад`;
        
        return new Date(timestamp).toLocaleDateString();
    }

    // Форматирование прогресс-бара
    static formatProgressBar(current, total, length = 10) {
        if (total === 0) return '[' + '░'.repeat(length) + ']';
        
        const percentage = current / total;
        const filled = Math.round(length * percentage);
        const empty = length - filled;
        
        return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
    }

    // Форматирование рейтинга звездочками
    static formatRating(rating, max = 5) {
        const fullStars = Math.floor(rating);
        const halfStar = rating % 1 >= 0.5;
        const emptyStars = max - fullStars - (halfStar ? 1 : 0);
        
        return '⭐'.repeat(fullStars) + 
               (halfStar ? '✨' : '') + 
               '☆'.repeat(emptyStars);
    }

    // Форматирование денежных сумм
    static formatCurrency(amount, currency = '₽') {
        return this.formatNumber(amount) + ' ' + currency;
    }

    // Форматирование номера телефона
    static formatPhone(phone) {
        if (!phone) return '';
        
        const cleaned = phone.replace(/\D/g, '');
        
        if (cleaned.length === 11) {
            return `+${cleaned[0]} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9)}`;
        }
        if (cleaned.length === 10) {
            return `+7 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 8)}-${cleaned.slice(8)}`;
        }
        
        return phone;
    }

    // Форматирование JSON с красивым выводом
    static formatJSON(obj, indent = 2) {
        try {
            return JSON.stringify(obj, null, indent);
        } catch {
            return String(obj);
        }
    }

    // Экранирование Markdown символов
    static escapeMarkdown(text) {
        if (!text) return '';
        
        return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
    }

    // Создание заголовка с разделителем
    static createHeader(title, width = 30) {
        const padding = Math.max(0, Math.floor((width - title.length - 2) / 2));
        const line = '═'.repeat(width);
        const paddedTitle = ' '.repeat(padding) + title + ' '.repeat(padding);
        
        return `${line}\n${paddedTitle}\n${line}`;
    }

    // Форматирование длинного списка с пагинацией
    static formatListWithPagination(items, page = 1, pageSize = 10) {
        const totalPages = Math.ceil(items.length / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = Math.min(startIndex + pageSize, items.length);
        const pageItems = items.slice(startIndex, endIndex);
        
        return {
            items: pageItems,
            pagination: {
                current: page,
                total: totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
                totalItems: items.length
            }
        };
    }

    // Генерация случайного цвета для пользователя
    static generateUserColor(userId) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#F9A826', 
            '#6C5CE7', '#00B894', '#FD79A8', '#FDCB6E',
            '#00CEC9', '#546DE5', '#E17055', '#D63031'
        ];
        
        const index = Math.abs(this.hashCode(userId.toString())) % colors.length;
        return colors[index];
    }

    // Хэш-функция для генерации цвета
    static hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        return hash;
    }
}

// Экспорт функций для обратной совместимости
module.exports = {
    formatDateShort: Formatters.formatDateShort,
    formatTime: Formatters.formatTime,
    formatDepartment: Formatters.formatDepartment,
    truncateName: Formatters.truncateName,
    smartText: Formatters.smartText,
    formatNumber: Formatters.formatNumber,
    formatPercent: Formatters.formatPercent,
    formatTimeRange: Formatters.formatTimeRange,
    formatDateTime: Formatters.formatDateTime,
    formatShiftStatus: Formatters.formatShiftStatus,
    formatApplicationStatus: Formatters.formatApplicationStatus,
    formatLongText: Formatters.formatLongText,
    formatFileSize: Formatters.formatFileSize,
    formatRelativeTime: Formatters.formatRelativeTime,
    formatProgressBar: Formatters.formatProgressBar,
    formatRating: Formatters.formatRating,
    formatCurrency: Formatters.formatCurrency,
    formatPhone: Formatters.formatPhone,
    formatJSON: Formatters.formatJSON,
    escapeMarkdown: Formatters.escapeMarkdown,
    createHeader: Formatters.createHeader,
    formatListWithPagination: Formatters.formatListWithPagination,
    generateUserColor: Formatters.generateUserColor,
    
    // Экспорт класса для расширенного использования
    Formatters
};