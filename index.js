const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');
const { session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const express = require('express');
const path = require('path');

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
        
        // Основной способ: переменная GOOGLE_CREDENTIALS
        if (process.env.GOOGLE_CREDENTIALS) {
            console.log('✅ Обнаружена переменная GOOGLE_CREDENTIALS');
            
            try {
                const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
                
                // Проверяем обязательные поля
                if (!credentials.private_key) {
                    throw new Error('Отсутствует private_key в credentials');
                }
                if (!credentials.client_email) {
                    throw new Error('Отсутствует client_email в credentials');
                }
                
                console.log('✅ Credentials успешно загружены из переменной окружения');
                return credentials;
                
            } catch (parseError) {
                throw new Error(`Ошибка парсинга JSON: ${parseError.message}`);
            }
        }
        
        throw new Error('Google credentials не найдены. Используйте один из способов:\n1. Установите переменную GOOGLE_CREDENTIALS\n2. Установите переменную GOOGLE_CREDENTIALS_BASE64\n3. Создайте файл google-credentials.json');
        
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
        
        // Проверяем обязательные поля
        if (!credentials.client_email || !credentials.private_key) {
            throw new Error('Невалидные credentials: отсутствует client_email или private_key');
        }

        // Создаем аутентификацию
        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });

        // Проверяем подключение
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
        
        // Проверяем доступ к таблице
        await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID
        });
        
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
    property: 'session'
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
    const sheets = await connectToGoogleSheets();
    const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: range
    });
    return result.data.values || [];
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
        const [action, shortFio, userId] = ctx.match[0].split('_');
        const fullFio = ctx.session?.fullFio;

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
                    // Создаем клавиатуру для выбора месяца
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
bot.action(/^month_(\d+)_(\d+)_([А-ЯЁа-яё]{9})$/, async (ctx) => {
    try {
        const [, month, year, shortFio] = ctx.match;
        const fullFio = ctx.session?.fullFio;
        const userId = ctx.from.id;
        
        if (!fullFio) {
            await ctx.answerCbQuery('ФИО не найдено');
            return;
        }

        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Март', 'Июнь', 
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        
        const monthName = monthNames[parseInt(month)];
        
        // Здесь будет логика получения данных за месяц
        const message = `📊 Производительность за ${monthName} ${year}\n` +
                       `👤 Сотрудник: ${fullFio}\n\n` +
                       `Данные за этот период пока недоступны.`;
        
        await ctx.editMessageText(message, {
            reply_markup: { 
                inline_keyboard: [
                    [{ text: '↩️ Выбрать другой месяц', callback_data: `p_${shortFio}_${userId}` }],
                    [{ text: '↩️ Назад в меню', callback_data: `back_${shortFio}_${userId}` }]
                ]
            }
        });
        
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Ошибка при выборе месяца:', error);
        await ctx.answerCbQuery('Ошибка при выборе месяца');
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
        
        // Проверяем подключение к Google Sheets
        try {
            await connectToGoogleSheets();
            console.log('✅ Google Sheets подключен');
        } catch (error) {
            console.error('❌ Ошибка подключения к Google Sheets:', error.message);
            process.exit(1);
        }

        if (process.env.RENDER) {
            console.log('🌐 Запуск в режиме webhook...');
            
            app.use(bot.webhookCallback('/telegram-webhook'));
            
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`✅ Сервер запущен на порту ${PORT}`);
            });
            
            const domain = process.env.RENDER_EXTERNAL_URL;
            await bot.telegram.setWebhook(`${domain}/telegram-webhook`);
            console.log('✅ Webhook установлен');
            
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