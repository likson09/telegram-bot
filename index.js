const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');
const { session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Загрузка конфигурации из переменных окружения
const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Проверка обязательных переменных
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не настроен в переменных окружения');
    process.exit(1);
}

if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID не настроен в переменных окружения');
    process.exit(1);
}

// Функция для загрузки Google credentials
function loadGoogleCredentials() {
    try {
        console.log('🔍 Поиск Google credentials...');
        
        if (process.env.GOOGLE_CREDENTIALS) {
            console.log('✅ Обнаружена переменная GOOGLE_CREDENTIALS');
            
            try {
                const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
                
                if (!credentials.private_key) {
                    throw new Error('Отсутствует private_key в credentials');
                }
                if (!credentials.client_email) {
                    throw new Error('Отсутствует client_email в credentials');
                }
                
                console.log('✅ Credentials успешно загружены');
                return credentials;
                
            } catch (parseError) {
                throw new Error(`Ошибка парсинга JSON: ${parseError.message}`);
            }
        }
        
        throw new Error('Google credentials не найдены');
        
    } catch (error) {
        console.error('❌ Критическая ошибка:', error.message);
        process.exit(1);
    }
}

// Подключение к Google Sheets
async function connectToGoogleSheets() {
    try {
        console.log('🔗 Подключение к Google Sheets...');
        
        const credentials = loadGoogleCredentials();
        
        if (!credentials.client_email || !credentials.private_key) {
            throw new Error('Невалидные credentials');
        }

        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        await auth.authorize();
        
        const sheets = google.sheets({ version: 'v4', auth });
        
        console.log('✅ Подключение к Google Sheets успешно');
        return sheets;
        
    } catch (error) {
        console.error('❌ Ошибка подключения к Google Sheets:', error.message);
        throw error;
    }
}

// Health check endpoints
app.use(express.json());
app.get('/', (req, res) => {
    res.json({ 
        status: 'Bot is running', 
        timestamp: new Date().toISOString(),
        service: 'Telegram Statistics Bot'
    });
});

app.get('/health', async (req, res) => {
    try {
        const sheets = await connectToGoogleSheets();
        await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        
        res.status(200).json({ 
            status: 'OK', 
            bot: 'running',
            sheets: 'connected',
            time: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            error: error.message,
            time: new Date().toISOString()
        });
    }
});

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// Middleware для сессий
bot.use((new LocalSession({ 
    database: 'sessions.json',
    storage: LocalSession.storageFileAsync,
    property: 'session',
    state: {
        currentData: null
    }
})).middleware());

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

// Функция для создания главного меню
function createMainMenu(shortFio, userId) {
    return [
        [
            { text: 'Ошибки', callback_data: `e_${shortFio}_${userId}` },
            { text: 'Табель', callback_data: `t_${shortFio}_${userId}` }
        ],
        [
            { text: 'Производительность', callback_data: `p_${shortFio}_${userId}` }
        ]
    ];
}

// Функция для создания кнопки "Назад в меню"
function createBackButton(shortFio, userId) {
    return [
        [{ text: '↩️ Назад в меню', callback_data: `back_${shortFio}_${userId}` }]
    ];
}

// Команда /start
bot.start(async (ctx) => {
    console.log('Получена команда /start от пользователя:', ctx.from.id);
    try {
        await ctx.reply('Привет! 👋 Отправьте ваше ФИО (Фамилия Имя Отчество) для получения статистики.');
    } catch (error) {
        console.error('Ошибка при ответе на /start:', error);
    }
});

// Функция валидации ФИО
function validateFIO(fio) {
    const parts = fio.trim().replace(/\s+/g, ' ').split(' ');
    return parts.length === 3 && parts.every(part => /^[А-ЯЁ][а-яё\-]*$/i.test(part));
}

// Обработчик текстовых сообщений (ФИО)
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const fio = ctx.message.text.trim();
    console.log('Получено ФИО:', fio);
    
    try {
        if (!validateFIO(fio)) {
            await ctx.reply('❌ Некорректный формат ФИО. Отправьте в формате: Фамилия Имя Отчество');
            return;
        }
        
        ctx.session.fullFio = fio;
        const [lastName, firstName, patronymic] = fio.split(' ');
        const shortFio = `${lastName.slice(0, 3)}${firstName.slice(0, 3)}${patronymic.slice(0, 3)}`;
        const userId = ctx.from.id;
        
        await ctx.reply('📊 Выберите раздел:', {
            reply_markup: { inline_keyboard: createMainMenu(shortFio, userId) }
        });
        
    } catch (error) {
        console.error('Ошибка при обработке ФИО:', error);
        await ctx.reply('⚠️ Произошла ошибка. Попробуйте позже.');
    }
});

// Вспомогательные функции для работы с Google Sheets
async function getSheetData(range) {
    try {
        const sheets = await connectToGoogleSheets();
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range
        });
        return result.data.values || [];
    } catch (error) {
        console.error('Ошибка при получении данных:', error);
        return [];
    }
}

async function getErrorCount(fio) {
    try {
        const rows = await getSheetData('Ошибки!A:C');
        const errors = rows.filter(row => row[0] === fio);
        return errors.length;
    } catch (error) {
        console.error('Ошибка при получении ошибок:', error);
        throw error;
    }
}

// Функция для получения данных отбора
async function getSelectionData(fio, year, month) {
    try {
        const rows = await getSheetData('Отбор!A:D');
        
        if (!rows) {
            throw new Error('Данные отбора не найдены');
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
            const os = parseFloat(row[2]) || 0;
            const rm = parseFloat(row[3]) || 0;
            
            data[`rm_day_${day}`] = rm;
            data[`os_day_${day}`] = os;
        });
        
        return data;
        
    } catch (error) {
        console.error('Ошибка при получении данных отбора:', error.message);
        throw error;
    }
}

// Функция для получения данных размещения
async function getPlacementData(fio, year, month) {
    try {
        const rows = await getSheetData('Размещение!A:D');
        
        if (!rows) {
            throw new Error('Данные размещения не найдены');
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
            const os = parseFloat(row[2]) || 0;
            const rm = parseFloat(row[3]) || 0;
            
            data[`rm_day_${day}`] = rm;
            data[`os_day_${day}`] = os;
        });
        
        return data;
        
    } catch (error) {
        console.error('Ошибка при получении данных размещения:', error.message);
        throw error;
    }
}

// Функция для получения данных производительности
async function getProductivityData(fio, year, month) {
    try {
        const selectionData = await getSelectionData(fio, year, month);
        const placementData = await getPlacementData(fio, year, month);

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

        return {
            selectionData,
            placementData,
            totalRmSelection,
            totalOsSelection,
            totalRmPlacement,
            totalOsPlacement,
            daysWithData,
            avgSelectionPerDay: daysWithData > 0 ? Math.round((totalRmSelection + totalOsSelection) / daysWithData) : 0,
            avgPlacementPerDay: daysWithData > 0 ? Math.round((totalRmPlacement + totalOsPlacement) / daysWithData) : 0
        };
        
    } catch (error) {
        console.error('Ошибка при получении данных производительности:', error.message);
        throw error;
    }
}

// Функция для получения данных табеля
async function getShiftData(fio) {
    try {
        const rows = await getSheetData('Табель!A:Z');
        
        if (!rows || rows.length < 2) {
            throw new Error('Данные табеля не найдены');
        }

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            for (let j = 0; j < Math.min(row.length, 10); j++) {
                if (row[j] && row[j].toString().trim() === fio) {
                    return {
                        plannedShifts: parseInt(row[0] || 0),
                        extraShifts: parseInt(row[1] || 0),
                        absences: parseInt(row[2] || 0),
                        reinforcementShifts: parseInt(row[3] || 0)
                    };
                }
            }
        }
        
        throw new Error('Сотрудник не найден в табеле');
        
    } catch (error) {
        console.error('Ошибка при получении данных табеля:', error);
        throw error;
    }
}

// Обработчик callback-запросов
bot.action(/^(e|p|t|back)_/, async (ctx) => {
    try {
        const callbackData = ctx.callbackQuery.data;
        const [action, shortFio, userId] = callbackData.split('_');
        const fullFio = ctx.session?.fullFio;

        console.log('Обработчик вызван:', { action, shortFio, userId });

        if (action === 'back') {
            await ctx.editMessageText('📊 Выберите раздел:', {
                reply_markup: { inline_keyboard: createMainMenu(shortFio, userId) }
            });
            await ctx.answerCbQuery();
            return;
        }

        if (!fullFio) {
            await ctx.answerCbQuery('ФИО не найдено');
            await ctx.reply('❌ ФИО не найдено. Пожалуйста, отправьте ФИО снова.');
            return;
        }

        switch (action) {
            case 'e':
                try {
                    const errorCount = await getErrorCount(fullFio);
                    await ctx.editMessageText(`📊 Количество ошибок для ${fullFio}: ${errorCount}`, {
                        reply_markup: { inline_keyboard: createBackButton(shortFio, userId) }
                    });
                } catch (error) {
                    console.error('Ошибка при получении ошибок:', error);
                    await ctx.editMessageText('❌ Не удалось получить данные об ошибках.', {
                        reply_markup: { inline_keyboard: createBackButton(shortFio, userId) }
                    });
                }
                break;
                
            case 'p':
                try {
                    const currentYear = new Date().getFullYear();
                    const currentMonth = new Date().getMonth();
                    
                    const monthKeyboard = [];
                    for (let i = 0; i < 6; i++) {
                        const monthDate = new Date(currentYear, currentMonth - i, 1);
                        const monthName = monthDate.toLocaleString('ru', { month: 'long' });
                        const year = monthDate.getFullYear();
                        const monthIndex = monthDate.getMonth();
                        
                        monthKeyboard.push([
                            { 
                                text: `${monthName} ${year}`, 
                                callback_data: `month_${monthIndex}_${year}_${shortFio}_${userId}`
                            }
                        ]);
                    }
                    
                    monthKeyboard.push([{ 
                        text: '↩️ Назад в меню', 
                        callback_data: `back_${shortFio}_${userId}` 
                    }]);
                    
                    await ctx.editMessageText('📅 Выберите месяц:', {
                        reply_markup: { inline_keyboard: monthKeyboard }
                    });
                } catch (error) {
                    console.error('Ошибка при создании меню производительности:', error);
                    await ctx.editMessageText('❌ Не удалось создать меню производительности.', {
                        reply_markup: { inline_keyboard: createBackButton(shortFio, userId) }
                    });
                }
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

                    await ctx.editMessageText(message, {
                        reply_markup: { inline_keyboard: createBackButton(shortFio, userId) }
                    });
                } catch (error) {
                    console.error('Ошибка при получении данных табеля:', error);
                    await ctx.editMessageText('❌ Не удалось получить данные табеля.', {
                        reply_markup: { inline_keyboard: createBackButton(shortFio, userId) }
                    });
                }
                break;
        }
        
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Ошибка в callback:', error);
        await ctx.answerCbQuery();
    }
});

// Обработчик для выбора месяца
bot.action(/^month_/, async (ctx) => {
    try {
        console.log('✅ Обработчик месяца вызван');
        
        const parts = ctx.callbackQuery.data.split('_');
        if (parts.length < 5) {
            console.log('❌ Неправильный формат callback_data:', parts);
            await ctx.answerCbQuery('Ошибка формата');
            return;
        }
        
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        const shortFio = parts[3];
        const userId = parts[4];
        
        console.log('Параметры:', { month, year, shortFio, userId });
        
        const fullFio = ctx.session?.fullFio;
        
        if (!fullFio) {
            console.log('❌ ФИО не найдено в сессии');
            await ctx.answerCbQuery('ФИО не найдено');
            return;
        }

        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        
        const monthName = monthNames[month];
        
        if (!monthName) {
            console.log('❌ Неизвестный месяц:', month);
            await ctx.answerCbQuery('Неизвестный месяц');
            return;
        }
        
        // Получаем данные производительности
        const productivityData = await getProductivityData(fullFio, year, month + 1);
        
        // Сохраняем данные в сессию для детализации
        ctx.session.currentData = {
            selectionData: productivityData.selectionData,
            placementData: productivityData.placementData,
            month: month + 1,
            year: year,
            fullFio: fullFio
        };

        const message = `📊 ПРОИЗВОДИТЕЛЬНОСТЬ ЗА ${monthName.toUpperCase()} ${year}\n` +
                       `👤 Сотрудник: ${fullFio}\n\n` +
                       `📦 ОТБОР ТОВАРА:\n` +
                       `├ ОС: ${productivityData.totalOsSelection} ед.\n` +
                       `└ РМ: ${productivityData.totalRmSelection} ед.\n\n` +
                       `📋 РАЗМЕЩЕНИЕ ТОВАРА:\n` +
                       `├ ОС: ${productivityData.totalOsPlacement} ед.\n` +
                       `└ РМ: ${productivityData.totalRmPlacement} ед.\n\n` +
                       `📈 ОБЩАЯ СТАТИСТИКА:\n` +
                       `├ Дней с данными: ${productivityData.daysWithData}\n` +
                       `├ Средний отбор/день: ${productivityData.avgSelectionPerDay} ед.\n` +
                       `└ Среднее размещение/день: ${productivityData.avgPlacementPerDay} ед.`;

        const detailKeyboard = [
            [{ text: '📋 Детализировать по дням', callback_data: `detail_${month}_${year}_${shortFio}_${userId}` }],
            [{ text: '↩️ Выбрать другой месяц', callback_data: `p_${shortFio}_${userId}` }],
            [{ text: '↩️ Назад в меню', callback_data: `back_${shortFio}_${userId}` }]
        ];

        await safeEditMessage(ctx, message, detailKeyboard);
        await ctx.answerCbQuery();
        console.log('✅ Сообщение успешно отправлено');
        
    } catch (error) {
        console.error('❌ Ошибка при выборе месяца:', error);
        await ctx.answerCbQuery('Ошибка при выборе месяца');
    }
});

// Обработчик для детализации
bot.action(/^detail_/, async (ctx) => {
    try {
        console.log('✅ Обработчик детализации вызван');
        
        const parts = ctx.callbackQuery.data.split('_');
        if (parts.length < 5) {
            console.log('❌ Неправильный формат callback_data:', parts);
            await ctx.answerCbQuery('Ошибка формата');
            return;
        }
        
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        const shortFio = parts[3];
        const userId = parts[4];
        
        const sessionData = ctx.session.currentData;
        
        if (!sessionData) {
            await ctx.answerCbQuery('Данные не найдены');
            return;
        }

        const { selectionData, placementData, fullFio } = sessionData;
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

        let message = `📋 *ДЕТАЛИЗАЦИЯ ПО ДНЯМ*\n`;
        message += `👤 ${fullFio}\n`;
        message += `📅 ${monthNames[month]} ${year}\n\n`;

        let hasData = false;
        
        for (let day = 1; day <= 31; day++) {
            const hasSelection = selectionData[`rm_day_${day}`] > 0 || selectionData[`os_day_${day}`] > 0;
            const hasPlacement = placementData[`rm_day_${day}`] > 0 || placementData[`os_day_${day}`] > 0;
            
            if (hasSelection || hasPlacement) {
                hasData = true;
                message += `*${day.toString().padStart(2, '0')}.${(month + 1).toString().padStart(2, '0')}.${year}*\n`;
                
                if (hasSelection) {
                    message += `📦 Отбор: `;
                    if (selectionData[`os_day_${day}`] > 0) message += `ОС=${selectionData[`os_day_${day}`]} `;
                    if (selectionData[`rm_day_${day}`] > 0) message += `РМ=${selectionData[`rm_day_${day}`]}`;
                    message += `\n`;
                }
                
                if (hasPlacement) {
                    message += `📋 Размещение: `;
                    if (placementData[`os_day_${day}`] > 0) message += `ОС=${placementData[`os_day_${day}`]} `;
                    if (placementData[`rm_day_${day}`] > 0) message += `РМ=${placementData[`rm_day_${day}`]}`;
                    message += `\n`;
                }
                message += `\n`;
            }
        }

        if (!hasData) {
            message += `Нет данных за выбранный период\n`;
        }

        const backKeyboard = [
            [{ text: '↩️ Назад к общей статистике', callback_data: `month_${month}_${year}_${shortFio}_${userId}` }],
            [{ text: '↩️ Назад в меню', callback_data: `back_${shortFio}_${userId}` }]
        ];

        await safeEditMessage(ctx, message, backKeyboard);
        await ctx.answerCbQuery();
        console.log('✅ Детализация отправлена');
        
    } catch (error) {
        console.error('❌ Ошибка при детализации:', error);
        await ctx.answerCbQuery('Ошибка при детализации');
    }
});

// Обработка ошибок
bot.catch((error, ctx) => {
    console.error('Ошибка бота:', error);
    ctx.reply('❌ Произошла непредвиденная ошибка.');
});

// Запуск бота
async function startBot() {
    try {
        console.log('🚀 Запуск Telegram бота...');
        
        try {
            await connectToGoogleSheets();
            console.log('✅ Google Sheets подключен');
        } catch (error) {
            console.error('❌ Ошибка подключения к Google Sheets:', error.message);
        }

        if (process.env.RENDER) {
            console.log('🌐 Запуск в режиме webhook...');
            
            app.use(bot.webhookCallback('/telegram-webhook'));
            
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`✅ Сервер запущен на порту ${PORT}`);
            });
            
            const domain = process.env.RENDER_EXTERNAL_URL;
            if (domain) {
                await bot.telegram.setWebhook(`${domain}/telegram-webhook`);
                console.log('✅ Webhook установлен');
            } else {
                console.log('❌ RENDER_EXTERNAL_URL не установлен');
            }
            
        } else {
            console.log('🔄 Запуск в режиме polling...');
            await bot.launch({
                dropPendingUpdates: true,
                polling: { timeout: 10, limit: 100 }
            });
        }
        
        console.log('✅ Бот успешно запущен!');
        
    } catch (error) {
        console.error('❌ Ошибка запуска бота:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Запускаем приложение
startBot();