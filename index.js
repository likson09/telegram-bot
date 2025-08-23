const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');
const { session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Health check endpoint
app.use(express.json());
app.get('/', (req, res) => {
    res.json({ 
        status: 'Bot is running', 
        timestamp: new Date(),
        service: 'Telegram Statistics Bot'
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        bot: 'running',
        time: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

// Validate environment variables
if (!BOT_TOKEN) {
    console.error('ERROR: BOT_TOKEN environment variable is required');
    process.exit(1);
}

if (!SPREADSHEET_ID) {
    console.error('ERROR: SPREADSHEET_ID environment variable is required');
    process.exit(1);
}

console.log('Environment variables loaded successfully');

// Функция для нормализации строк (замена Ё на Е)
function normalizeString(str) {
    if (!str) return '';
    return str.normalize('NFD').replace(/Ё/g, 'Е').normalize('NFC');
}

// Функция валидации ФИО с улучшенной логикой
function validateFIO(fio) {
    // Удаляем лишние пробелы
    fio = fio.trim().replace(/\s+/g, ' ');
    
    // Разбиваем на части
    const parts = fio.split(' ');
    
    // Проверяем количество частей
    if (parts.length !== 3) {
        console.log('Ошибка: Неверное количество частей ФИО');
        return false;
    }
    
    // Проверяем первую букву каждой части
    if (!parts.every(part => /^[А-ЯЁ]/.test(part))) {
        console.log('Ошибка: Части ФИО должны начинаться с заглавной буквы');
        return false;
    }
    
    // Регулярное выражение для проверки каждой части
    const regex = /^[А-ЯЁа-яё\-]+$/;
    
    // Проверяем каждую часть ФИО
    for (let part of parts) {
        if (!regex.test(part)) {
            console.log(`Ошибка в части ФИО: ${part}`);
            return false;
        }
    }
    
    return true;
}

// Инициализация бота с расширенными сессиями
const bot = new Telegraf(BOT_TOKEN);
bot.use((new LocalSession({ 
    database: 'sessions.json',
    storage: LocalSession.storageFileAsync,
    property: 'session',
    state: {
        fullFio: null,
        step: null,
        action: null,
        currentData: null
    }
})).middleware());

// Функция для создания главного меню
function createMainMenu(shortFio, userId) {
    return [
        [
            { text: 'Ошибки', callback_data: `e_${shortFio}_${userId}` },
            { text: 'Производительность', callback_data: `p_${shortFio}_${userId}` }
        ],
        [
            { text: 'Табель', callback_data: `t_${shortFio}_${userId}` }
        ]
    ];
}

// Функция для создания кнопки "Назад в меню"
function createBackButton(shortFio, userId) {
    return [
        [{ text: '↩️ Назад в меню', callback_data: `back_${shortFio}_${userId}` }]
    ];
}

// Функция для безопасного редактирования сообщений
async function safeEditMessage(ctx, text, markup = null) {
    try {
        if (markup) {
            await ctx.editMessageText(text, { 
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: markup }
            });
        } else {
            await ctx.editMessageText(text, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        if (error.description === 'Bad Request: message is not modified') {
            return;
        }
        console.error('Ошибка редактирования сообщения:', error);
        await ctx.reply(text, { 
            parse_mode: 'Markdown',
            reply_markup: markup ? { inline_keyboard: markup } : undefined
        });
    }
}

// Команда /start
bot.start(async (ctx) => {
    console.log('Получена команда /start');
    try {
        await ctx.reply('Привет! Отправьте ваше ФИО (Фамилия Имя Отчество) для получения статистики.');
    } catch (error) {
        console.error('Ошибка при ответе на /start:', error);
    }
});

// Mock данные для тестирования
function createMockSheets() {
    return {
        spreadsheets: {
            values: {
                get: async (params) => {
                    console.log('Mock запрос к Google Sheets:', params.range);
                    return { data: { values: [] } };
                }
            },
            get: async (params) => {
                console.log('Mock запрос информации о таблице');
                return { data: { properties: { title: 'Mock Table' } } };
            }
        }
    };
}


function createEmptyDailyData() {
    const data = {};
    for (let day = 1; day <= 31; day++) {
        data[`rm_day_${day}`] = 0;
        data[`os_day_${day}`] = 0;
    }
    return data;
}

// Подключение к Google Sheets
async function safeConnectToSheet() {
    try {
        console.log('Подключение к Google Sheets...');

        const API_KEY = process.env.GOOGLE_API_KEY;
        
        if (!API_KEY) {
            console.log('API ключ не найден, используем mock данные');
            return createMockSheets();
        }

        // Прямое создание клиента с API ключом
        const sheets = google.sheets({
            version: 'v4',
            auth: API_KEY
        });

        // Проверяем подключение
        try {
            const test = await sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_ID,
                fields: 'properties.title'
            });
            console.log('Успешное подключение к таблице:', test.data.properties.title);
        } catch (testError) {
            console.log('Таблица недоступна, используем mock данные');
            return createMockSheets();
        }

        return sheets;
        
    } catch (error) {
        console.error('Ошибка при подключении к Google Sheets:', error.message);
        return createMockSheets();
    }
}

// Обработчик текстовых сообщений (ФИО)
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
        return;
    }

    let fio = ctx.message.text.trim().replace(/\s+/g, ' ').replace(/[^А-ЯЁа-яё\s]/g, '');
    
    console.log('Полученная строка ФИО:', fio);
    
    try {
        if (!validateFIO(fio)) {
            await ctx.reply('Некорректный формат ФИО. Отправьте в формате: Фамилия Имя Отчество');
            return;
        }
        
        ctx.session.fullFio = fio;
        ctx.session.step = 'main_menu';
        
        const [lastName, firstName, patronymic] = fio.split(' ');
        const shortFio = `${lastName.slice(0, 3)}${firstName.slice(0, 3)}${patronymic.slice(0, 3)}`;
        const userId = ctx.from.id;
        
        await ctx.reply('Выберите раздел:', {
            reply_markup: { inline_keyboard: createMainMenu(shortFio, userId) }
        });
        
    } catch (error) {
        console.error('Ошибка при обработке запроса:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
});

// Обработчик callback-запросов
bot.action(/^(e|p|t|back)_([А-ЯЁа-яё]{9})_(\d+)$/, async (ctx) => {
    try {
        const [, action, shortFio, userId] = ctx.match;
        const fullFio = ctx.session?.fullFio;
        
        if (action === 'back') {
            await safeEditMessage(ctx, 'Выберите раздел:', createMainMenu(shortFio, userId));
            await ctx.answerCbQuery();
            return;
        }

        if (!fullFio) {
            await ctx.reply('ФИО не найдено. Пожалуйста, отправьте ФИО снова.');
            await ctx.answerCbQuery();
            return;
        }

        switch (action) {
            case 'e':
                try {
                    const errorCount = await getErrorCount(fullFio);
                    await safeEditMessage(ctx, `Количество ошибок для ${fullFio}: ${errorCount}`, createBackButton(shortFio, userId));
                } catch (error) {
                    console.error('Ошибка при получении ошибок:', error);
                    await safeEditMessage(ctx, 'Не удалось получить данные об ошибках.', createBackButton(shortFio, userId));
                }
                break;
                
            case 'p':
                const currentYear = new Date().getFullYear();
                const currentMonth = new Date().getMonth();
                
                const monthKeyboard = [];
                for (let i = 0; i < 6; i++) {
                    const monthDate = new Date(currentYear, currentMonth - i, 1);
                    const monthName = monthDate.toLocaleString('ru', { month: 'long' });
                    const year = monthDate.getFullYear();
                    
                    monthKeyboard.push([
                        { 
                            text: `${monthName} ${year}`, 
                            callback_data: `month_${monthDate.getMonth()}_${year}_${shortFio}`
                        }
                    ]);
                }
                
                monthKeyboard.push([{ 
                    text: '↩️ Назад в меню', 
                    callback_data: `back_${shortFio}_${userId}` 
                }]);
                
                await safeEditMessage(ctx, '📅 Выберите месяц:', monthKeyboard);
                break;
                
            case 't':
                try {
                    const shiftData = await getShiftData(fullFio);
                    const totalWorked = shiftData.plannedShifts + shiftData.extraShifts + shiftData.reinforcementShifts;
                    const attendanceRate = shiftData.plannedShifts > 0 
                        ? (totalWorked / shiftData.plannedShifts) * 100 
                        : 0;

                    const message = `📊 ТАБЕЛЬ ДЛЯ ${fullFio}:\n\n` +
                        `📅 График: ${shiftData.plannedShifts} смен\n` +
                        `➕ Доп. смены: ${shiftData.extraShifts}\n` +
                        `❌ Прогулы: ${shiftData.absences}\n` +
                        `💪 Усиления: ${shiftData.reinforcementShifts}\n` +
                        `✅ Всего отработано: ${totalWorked} смен\n` +
                        `📈 Посещаемость: ${attendanceRate.toFixed(2)}%`;

                    await safeEditMessage(ctx, message, createBackButton(shortFio, userId));
                } catch (error) {
                    console.error('Ошибка при получении данных табеля:', error);
                    await safeEditMessage(ctx, 'Не удалось получить данные табеля.', createBackButton(shortFio, userId));
                }
                break;
        }
        
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Ошибка при обработке callback:', error);
        await ctx.answerCbQuery();
    }
});

// Обработчик для выбора месяца
bot.action(/^month_(\d+)_(\d+)_([А-ЯЁа-яё]{9})$/, async (ctx) => {
    try {
        const [, month, year, shortFio] = ctx.match;
        const fullFio = ctx.session?.fullFio;
        const userId = ctx.from.id;
        
        if (!fullFio) {
            await ctx.answerCbQuery('ФИО не найдено');
            return;
        }

        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        
        const monthName = monthNames[parseInt(month)];
        const monthNumber = parseInt(month) + 1;
        
        const selectionData = await getSelectionData(fullFio, parseInt(year), monthNumber);
        const placementData = await getPlacementData(fullFio, parseInt(year), monthNumber);

        let totalRmSelection = 0;
        let totalOsSelection = 0;
        let totalRmPlacement = 0;
        let totalOsPlacement = 0;
        let daysWithData = 0;

        for (let day = 1; day <= 31; day++) {
            if (selectionData[`rm_day_${day}`] > 0 || selectionData[`os_day_${day}`] > 0 ||
                placementData[`rm_day_${day}`] > 0 || placementData[`os_day_${day}`] > 0) {
                daysWithData++;
                totalRmSelection += selectionData[`rm_day_${day}`];
                totalOsSelection += selectionData[`os_day_${day}`];
                totalRmPlacement += placementData[`rm_day_${day}`];
                totalOsPlacement += placementData[`os_day_${day}`];
            }
        }

        ctx.session.currentData = { selectionData, placementData, month: monthNumber, year: parseInt(year), fullFio };

        let message = `📊 *СТАТИСТИКА ПРОИЗВОДИТЕЛЬНОСТИ*\n`;
        message += `👤 *${fullFio}*\n`;
        message += `📅 *${monthName} ${year}*\n\n`;

        // ПОМЕНЯЛИ РМ и ОС МЕСТАМИ!
        message += `📦 *ОТБОР ТОВАРА*\n`;
        message += `├ ОС: ${totalOsSelection} ед.\n`;  // Было РМ, стало ОС
        message += `└ РМ: ${totalRmSelection} ед.\n\n`; // Было ОС, стало РМ

        message += `📋 *РАЗМЕЩЕНИЕ ТОВАРА*\n`;
        message += `├ ОС: ${totalOsPlacement} ед.\n`;   // Было РМ, стало ОС
        message += `└ РМ: ${totalRmPlacement} ед.\n\n`; // Было ОС, стало РМ

        message += `📈 *ОБЩАЯ СТАТИСТИКА*\n`;
        message += `├ Дней с данными: ${daysWithData}\n`;
        message += `├ Средний отбор/день: ${daysWithData > 0 ? Math.round((totalRmSelection + totalOsSelection)/daysWithData) : 0} ед.\n`;
        message += `└ Среднее размещение/день: ${daysWithData > 0 ? Math.round((totalRmPlacement + totalOsPlacement)/daysWithData) : 0} ед.\n`;

        const detailKeyboard = [
            [{ text: '📋 Детализировать по дням', callback_data: `detail_${month}_${year}_${shortFio}` }],
            [{ text: '↩️ Выбрать другой месяц', callback_data: `p_${shortFio}_${userId}` }],
            [{ text: '↩️ Назад в меню', callback_data: `back_${shortFio}_${userId}` }]
        ];

        await safeEditMessage(ctx, message, detailKeyboard);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Ошибка при получении данных за месяц:', error);
        await ctx.answerCbQuery('Ошибка получения данных');
    }
});

// Обработчик для детализации
bot.action(/^detail_(\d+)_(\d+)_([А-ЯЁа-яё]{9})$/, async (ctx) => {
    try {
        const sessionData = ctx.session.currentData;
        const userId = ctx.from.id;
        
        if (!sessionData) {
            await ctx.answerCbQuery('Данные не найдены');
            return;
        }

        const { selectionData, placementData, month, year, fullFio } = sessionData;
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

        let message = `📋 *ДЕТАЛИЗАЦИЯ ПО ДНЯМ*\n`;
        message += `👤 ${fullFio}\n`;
        message += `📅 ${monthNames[month-1]} ${year}\n\n`;

        let hasData = false;
        
        for (let day = 1; day <= 31; day++) {
            const hasSelection = selectionData[`rm_day_${day}`] > 0 || selectionData[`os_day_${day}`] > 0;
            const hasPlacement = placementData[`rm_day_${day}`] > 0 || placementData[`os_day_${day}`] > 0;
            
            if (hasSelection || hasPlacement) {
                hasData = true;
                message += `*${day.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}*\n`;
                
                if (hasSelection) {
                    message += `📦 Отбор: `;
                    // ПОМЕНЯЛИ РМ и ОС МЕСТАМИ!
                    if (selectionData[`os_day_${day}`] > 0) message += `ОС=${selectionData[`os_day_${day}`]} `; // Было РМ
                    if (selectionData[`rm_day_${day}`] > 0) message += `РМ=${selectionData[`rm_day_${day}`]}`;   // Было ОС
                    message += `\n`;
                }
                
                if (hasPlacement) {
                    message += `📋 Размещение: `;
                    // ПОМЕНЯЛИ РМ и ОС МЕСТАМИ!
                    if (placementData[`os_day_${day}`] > 0) message += `ОС=${placementData[`os_day_${day}`]} `; // Было РМ
                    if (placementData[`rm_day_${day}`] > 0) message += `РМ=${placementData[`rm_day_${day}`]}`;   // Было ОС
                    message += `\n`;
                }
                message += `\n`;
            }
        }

        if (!hasData) {
            message += `Нет данных за выбранный период\n`;
        }

        const backKeyboard = [
            [{ text: '↩️ Назад к общей статистике', callback_data: `month_${month-1}_${year}_${ctx.match[3]}` }],
            [{ text: '↩️ Назад в меню', callback_data: `back_${ctx.match[3]}_${userId}` }]
        ];

        await safeEditMessage(ctx, message, backKeyboard);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Ошибка при детализации:', error);
        await ctx.answerCbQuery('Ошибка детализации');
    }
});

// Вспомогательные функции для работы с данными
async function getErrorCount(fio) {
    try {
        const sheets = await safeConnectToSheet();
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Ошибки!A:C'
        });

        const rows = result.data.values;
        if (!rows || rows.length === 0) {
            console.log('Нет данных в листе Ошибки, возвращаем 0');
            return 0;
        }

        const errors = rows.filter(row => row[0] === fio);
        return errors.length;
    } catch (error) {
        console.error('Ошибка при получении количества ошибок:', error.message);
        return 0;
    }
}

async function getSelectionData(fio, year, month) {
    try {
        const sheets = await safeConnectToSheet();
        const range = `Отбор!A:D`;
        
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range
        });
        
        const rows = result.data.values;
        if (!rows) {
            return createEmptyDailyData();
        }
        
        const data = {};
        
        for (let day = 1; day <= 31; day++) {
            data[`rm_day_${day}`] = 0;
            data[`os_day_${day}`] = 0;
        }
        
        const filteredData = rows.filter(row => {
            if (row.length < 4) return false;
            
            const rowDate = new Date(row[1]);
            return row[0] === fio && 
                   rowDate.getFullYear() === year && 
                   rowDate.getMonth() + 1 === month;
        });
        
        filteredData.forEach(row => {
            const day = new Date(row[1]).getDate();
            // ПОМЕНЯЛИ РМ и ОС МЕСТАМИ!
            const os = parseFloat(row[2]) || 0; // Было РМ, стало ОС (столбец 2)
            const rm = parseFloat(row[3]) || 0; // Было ОС, стало РМ (столбец 3)
            
            data[`rm_day_${day}`] = rm;
            data[`os_day_${day}`] = os;
        });
        
        return data;
        
    } catch (error) {
        console.error('Ошибка при получении данных отбора:', error.message);
        return createEmptyDailyData();
    }
}

async function getPlacementData(fio, year, month) {
    try {
        const sheets = await safeConnectToSheet();
        const range = `Размещение!A:D`;
        
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range
        });
        
        const rows = result.data.values;
        if (!rows) {
            return createEmptyDailyData();
        }
        
        const data = {};
        
        for (let day = 1; day <= 31; day++) {
            data[`rm_day_${day}`] = 0;
            data[`os_day_${day}`] = 0;
        }
        
        const filteredData = rows.filter(row => {
            if (row.length < 4) return false;
            
            const rowDate = new Date(row[1]);
            return row[0] === fio && 
                   rowDate.getFullYear() === year && 
                   rowDate.getMonth() + 1 === month;
        });
        
        filteredData.forEach(row => {
            const day = new Date(row[1]).getDate();
            // ПОМЕНЯЛИ РМ и ОС МЕСТАМИ!
            const os = parseFloat(row[2]) || 0; // Было РМ, стало ОС (столбец 2)
            const rm = parseFloat(row[3]) || 0; // Было ОС, стало РМ (столбец 3)
            
            data[`rm_day_${day}`] = rm;
            data[`os_day_${day}`] = os;
        });
        
        return data;
        
    } catch (error) {
        console.error('Ошибка при получении данных размещения:', error.message);
        return createEmptyDailyData();
    }
}

async function getShiftData(fio) {
    try {
        const sheets = await safeConnectToSheet();
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Табель!A:Z'
        });

        const rows = result.data.values;
        if (!rows || rows.length < 2) {
            console.log('Нет данных в листе Табель, используем mock данные');
            return getMockShiftData();
        }

        // Поиск сотрудника в таблице
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            for (let j = 0; j < Math.min(row.length, 10); j++) {
                if (row[j] && row[j].toString().trim() === fio) {
                    return {
                        plannedShifts: parseInt(row[0] || 0, 10),
                        extraShifts: parseInt(row[1] || 0, 10),
                        absences: parseInt(row[2] || 0, 10),
                        reinforcementShifts: parseInt(row[3] || 0, 10)
                    };
                }
            }
        }
        
        console.log('Сотрудник не найден в табеле, используем mock данные');
        return getMockShiftData();
        
    } catch (error) {
        console.error('Ошибка при получении данных табеля:', error.message);
        return getMockShiftData();
    }
}

// Глобальная обработка ошибок
bot.catch(async (error, ctx) => {
    console.error('Произошла ошибка в боте:', error);
    try {
        await ctx.reply('Произошла непредвиденная ошибка. Попробуйте позже.');
    } catch (err) {
        console.error('Не удалось отправить сообщение об ошибке:', err);
    }
});

// Запуск бота с обработкой конфликтов
async function startBot() {
    try {
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: [],
            polling: {
                params: {
                    timeout: 30,
                    limit: 100,
                    offset: Math.floor(Math.random() * 1000)
                }
            }
        });
        
        console.log('Telegram бот запущен успешно!');
    } catch (error) {
        console.error('Ошибка при запуске бота:', error);
        if (error.response?.error_code === 409) {
            console.log('Обнаружена конфликтная сессия, попробуйте позже');
        }
        process.exit(1);
    }
}

// Запускаем бота
startBot();

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Application started successfully');