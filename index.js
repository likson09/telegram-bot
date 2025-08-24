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

// Супер-админ (я)
const SUPER_ADMIN_ID = 566632489;

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
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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

// Функции для работы с администраторами
async function getAdmins() {
    try {
        const sheets = await connectToGoogleSheets();
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Администраторы!A:A'
        });
        
        const rows = result.data.values || [];
        return rows.slice(1).map(row => parseInt(row[0])).filter(id => !isNaN(id));
    } catch (error) {
        console.error('Ошибка при получении списка администраторов:', error);
        return [SUPER_ADMIN_ID];
    }
}

async function addAdmin(userId) {
    try {
        const sheets = await connectToGoogleSheets();
        const currentAdmins = await getAdmins();
        
        if (currentAdmins.includes(userId)) {
            throw new Error('Пользователь уже является администратором');
        }
        
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Администраторы!A:A',
            valueInputOption: 'RAW',
            resource: {
                values: [[userId]]
            }
        });
        
        return true;
    } catch (error) {
        console.error('Ошибка при добавлении администратора:', error);
        throw error;
    }
}

async function removeAdmin(userId) {
    try {
        const sheets = await connectToGoogleSheets();
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Администраторы!A:A'
        });
        
        const rows = result.data.values || [];
        const updatedRows = rows.filter((row, index) => {
            if (index === 0) return true;
            if (parseInt(row[0]) === SUPER_ADMIN_ID) return true;
            return parseInt(row[0]) !== userId;
        });
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Администраторы!A:A',
            valueInputOption: 'RAW',
            resource: {
                values: updatedRows
            }
        });
        
        return true;
    } catch (error) {
        console.error('Ошибка при удалении администратора:', error);
        throw error;
    }
}

async function isAdmin(userId) {
    if (userId === SUPER_ADMIN_ID) return true;
    
    try {
        const admins = await getAdmins();
        return admins.includes(userId);
    } catch (error) {
        console.error('Ошибка при проверке прав администратора:', error);
        return false;
    }
}

// Функция для проверки наличия сотрудника в таблицах
async function checkEmployeeExists(fio) {
    try {
        console.log(`🔍 Проверка наличия сотрудника: ${fio}`);
        const sheets = await connectToGoogleSheets();
        
        const tablesToCheck = ['Ошибки!A:A', 'Табель!A:Z', 'Отбор!A:A', 'Размещение!A:A'];
        
        for (const range of tablesToCheck) {
            try {
                const result = await sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: range
                });
                
                const rows = result.data.values || [];
                const found = rows.some(row => row.some(cell => cell && cell.toString().trim() === fio));
                
                if (found) {
                    console.log(`✅ Сотрудник найден в таблице: ${range.split('!')[0]}`);
                    return true;
                }
            } catch (error) {
                console.warn(`⚠️ Ошибка при проверке таблицы ${range}:`, error.message);
                continue;
            }
        }
        
        console.log(`❌ Сотрудник не найден ни в одной таблице: ${fio}`);
        return false;
        
    } catch (error) {
        console.error('❌ Ошибка при проверке сотрудника:', error.message);
        throw new Error('Ошибка при проверке данных таблиц');
    }
}

async function getAvailableShifts() {
    try {
        const sheets = await connectToGoogleSheets();
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Подработки!A:G'
        });
        
        const rows = result.data.values || [];
        if (rows.length < 2) return [];
        
        return rows.slice(1).filter(row => row.length >= 7 && row[6] === 'active').map((row, index) => ({
            id: row[0] || (index + 1).toString(), // Используем ID из таблицы или индекс
            date: row[1],
            time: row[2],
            department: row[3],
            requiredPeople: parseInt(row[4] || 0),
            signedUp: row[5] ? row[5].split(',').filter(Boolean) : [],
            status: row[6]
        }));
    } catch (error) {
        console.error('Ошибка при получении смен:', error);
        return [];
    }
}

async function signUpForShift(userId, userName, shiftId) {
    try {
        const sheets = await connectToGoogleSheets();
        const shifts = await getAvailableShifts();
        const shift = shifts.find(s => s.id === shiftId);
        
        if (!shift) {
            throw new Error('Смена не найдена');
        }
        
        if (shift.signedUp.includes(userName)) {
            throw new Error('Вы уже записаны на эту смену');
        }
        
        if (shift.signedUp.length >= shift.requiredPeople) {
            throw new Error('На эту смену уже набрано достаточно людей');
        }
        
        const range = `Подработки!A${parseInt(shiftId) + 1}:G${parseInt(shiftId) + 1}`;
        const newSignedUp = [...shift.signedUp, userName].join(',');
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    shift.id,
                    shift.date,
                    shift.time,
                    shift.department,
                    shift.requiredPeople,
                    newSignedUp,
                    shift.status
                ]]
            }
        });
        
        return true;
    } catch (error) {
        console.error('Ошибка при записи на смену:', error);
        throw error;
    }
}

async function getUserApplications(userName) {
    try {
        const shifts = await getAvailableShifts();
        return shifts.filter(shift => shift.signedUp.includes(userName));
    } catch (error) {
        console.error('Ошибка при получении заявок:', error);
        return [];
    }
}

async function getShiftById(shiftId) {
    try {
        const shifts = await getAvailableShifts();
        // Ищем смену по ID (преобразуем оба значения к строкам для сравнения)
        return shifts.find(shift => shift.id.toString() === shiftId.toString());
    } catch (error) {
        console.error('Ошибка при поиске смены:', error);
        return null;
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
        currentData: null,
        creatingShift: false,
        shiftData: {},
        adminAction: null
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

// Функция для создания красивого главного меню
function createMainMenu(shortFio, userId, fio) {
    return [
        [
            { 
                text: '📊 Ошибки', 
                callback_data: `e_${shortFio}_${userId}` 
            },
            { 
                text: '📅 Табель', 
                callback_data: `t_${shortFio}_${userId}` 
            }
        ],
        [
            { 
                text: '🚀 Производительность', 
                callback_data: `p_${shortFio}_${userId}` 
            },
            { 
                text: '💼 Подработки', 
                callback_data: `work_${shortFio}_${userId}` 
            }
        ],
        [
            { 
                text: '🔄 Сменить ФИО', 
                callback_data: `change_fio_${userId}` 
            }
        ]
    ];
}

// Функция для создания кнопки "Назад в меню"
function createBackButton(shortFio, userId) {
    return [
        [{ 
            text: '↩️ Назад в меню', 
            callback_data: `back_${shortFio}_${userId}` 
        }]
    ];
}

// Команда /start
bot.start(async (ctx) => {
    console.log('Получена команда /start от пользователя:', ctx.from.id);
    try {
        const isUserAdmin = await isAdmin(ctx.from.id);
        const welcomeMessage = `👋 *Добро пожаловать в бот статистики!*\n\n` +
                              `📈 Здесь вы можете получить информацию о:\n` +
                              `• 📊 Количестве ошибок\n` +
                              `• 📅 Данных табеля\n` +
                              `• 🚀 Производительности труда\n\n` +
                              `${isUserAdmin ? '⚡ *Вы администратор системы*\n• Используйте /podrabotka для создания смен\n• Используйте /admin для управления' : ''}\n\n` +
                              `📝 *Отправьте ваше ФИО* (Фамилия Имя Отчество) для начала работы.`;
        
        await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Ошибка при ответе на /start:', error);
    }
});

// Команда /admin для супер-админа
bot.command('admin', async (ctx) => {
    try {
        if (ctx.from.id !== SUPER_ADMIN_ID) {
            await ctx.reply('❌ Недостаточно прав для выполнения этой команды.');
            return;
        }

        const adminMenu = [
            [
                { text: '👥 Список админов', callback_data: 'admin_list' },
                { text: '➕ Добавить админа', callback_data: 'admin_add' }
            ],
            [
                { text: '➖ Удалить админа', callback_data: 'admin_remove' },
                { text: '📊 Статистика', callback_data: 'admin_stats' }
            ],
            [
                { text: '❌ Закрыть', callback_data: 'admin_close' }
            ]
        ];

        await ctx.reply('👑 *ПАНЕЛЬ СУПЕР-АДМИНИСТРАТОРА*', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: adminMenu }
        });
    } catch (error) {
        console.error('Ошибка в команде /admin:', error);
        await ctx.reply('❌ Ошибка при открытии панели администратора.');
    }
});

// Команда /podrabotka для создания смен
bot.command('podrabotka', async (ctx) => {
    try {
        const userId = ctx.from.id;
        const isUserAdmin = await isAdmin(userId);
        
        if (!isUserAdmin) {
            await ctx.reply('❌ Недостаточно прав! Только администраторы могут создавать смены.');
            return;
        }

        ctx.session.creatingShift = true;
        ctx.session.shiftData = {};
        
        await ctx.reply('📝 *СОЗДАНИЕ НОВОЙ СМЕНЫ ДЛЯ ПОДРАБОТКИ*\n\n' +
                       'Введите данные в следующем порядке:\n\n' +
                       '1. 📅 *Дата* (формат: ДД.ММ.ГГГГ)\n' +
                       '2. ⏰ *Время* (формат: ЧЧ:ММ-ЧЧ:ММ)\n' + 
                       '3. 🏢 *Отдел/место*\n' +
                       '4. 👥 *Количество человек*\n\n' +
                       'Пример:\n' +
                       '15.01.2024\n' +
                       '14:00-22:00\n' +
                       'Склад\n' +
                       '3', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Отменить создание', callback_data: 'cancel_creation' }
                ]]
            }
        });
        
    } catch (error) {
        console.error('Ошибка в команде /podrabotka:', error);
        await ctx.reply('❌ Ошибка при создании смены. Попробуйте позже.');
    }
});

// Добавьте эту команду для проверки
bot.command('debug_shifts', async (ctx) => {
    try {
        const shifts = await getAvailableShifts();
        let message = '🔧 *ДЕБАГ СМЕН:*\n\n';
        
        if (shifts.length === 0) {
            message += '📭 Нет доступных смен';
        } else {
            shifts.forEach((shift, index) => {
                message += `${index + 1}. ID: ${shift.id} | ${shift.date} ${shift.time}\n`;
                message += `   Отдел: ${shift.department} | Нужно: ${shift.requiredPeople}\n`;
                message += `   Статус: ${shift.status}\n\n`;
            });
        }
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Ошибка при отладке:', error);
        await ctx.reply('❌ Ошибка при получении данных смен');
    }
});

// Обработчик для отмены создания
bot.action('cancel_creation', async (ctx) => {
    ctx.session.creatingShift = false;
    ctx.session.shiftData = {};
    await ctx.editMessageText('❌ Создание смены отменено.');
    await ctx.answerCbQuery();
});

// Обработчик для смене ФИО
bot.action(/^change_fio_/, async (ctx) => {
    try {
        await ctx.editMessageText('📝 *Отправьте ваше ФИО заново:*\n(Фамилия Имя Отчество)', { 
            parse_mode: 'Markdown' 
        });
        await ctx.answerCbQuery();
    } catch (error) {
        console.error('Ошибка при смене ФИО:', error);
        await ctx.answerCbQuery('⚠️ Ошибка при смене ФИО');
    }
});

// Обработчик для меню подработок
bot.action(/^work_/, async (ctx) => {
    try {
        const [action, shortFio, userId] = ctx.callbackQuery.data.split('_');
        const fullFio = ctx.session?.fullFio;

        const workMenu = [
            [
                { text: '📋 Доступные смены', callback_data: `shifts_list_${shortFio}_${userId}` },
                { text: '📝 Мои заявки', callback_data: `my_applications_${shortFio}_${userId}` }
            ],
            [
                { text: '↩️ Назад в меню', callback_data: `back_${shortFio}_${userId}` }
            ]
        ];

        await ctx.editMessageText(`💼 *СИСТЕМА ПОДРАБОТОК*\n\n👤 Сотрудник: ${fullFio}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: workMenu }
        });
    } catch (error) {
        console.error('Ошибка при открытии меню подработок:', error);
        await ctx.editMessageText('❌ Не удалось открыть меню подработок.', {
            reply_markup: { inline_keyboard: createBackButton(shortFio, userId) }
        });
    }
});

// Функция валидации ФИО
function validateFIO(fio) {
    const parts = fio.trim().replace(/\s+/g, ' ').split(' ');
    return parts.length === 3 && parts.every(part => /^[А-ЯЁ][а-яё\-]*$/i.test(part));
}

// Обработчик текстовых сообщений
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    // Обработка создания смены через команду /podrabotka
    if (ctx.session.creatingShift) {
    try {
        const text = ctx.message.text.trim();
        
        if (!ctx.session.shiftData.date) {
            if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
                await ctx.reply('❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ\nПример: 15.01.2024');
                return;
            }
            ctx.session.shiftData.date = text;
            await ctx.reply('✅ Дата сохранена.\n⏰ Теперь введите время смены (формат: ЧЧ:ММ-ЧЧ:ММ)\nПример: 14:00-22:00');
            return;
        }
        
        if (!ctx.session.shiftData.time) {
            if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(text)) {
                await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ-ЧЧ:ММ\nПример: 14:00-22:00');
                return;
            }
            ctx.session.shiftData.time = text;
            await ctx.reply('✅ Время сохранено.\n🏢 Теперь введите отдел или место работы\nПример: Склад или Торговый зал');
            return;
        }
        
        if (!ctx.session.shiftData.department) {
            ctx.session.shiftData.department = text;
            await ctx.reply('✅ Отдел сохранен.\n👥 Теперь введите количество требуемых человек (только цифру)\nПример: 3');
            return;
        }
        
        if (!ctx.session.shiftData.requiredPeople) {
            const peopleCount = parseInt(text);
            if (isNaN(peopleCount) || peopleCount <= 0) {
                await ctx.reply('❌ Неверное количество. Введите число больше 0\nПример: 3');
                return;
            }
            ctx.session.shiftData.requiredPeople = peopleCount;
            
            // Сохраняем данные перед сбросом сессии
            const shiftData = { ...ctx.session.shiftData };
            
            // Создаем смену
            const sheets = await connectToGoogleSheets();
            const shifts = await getAvailableShifts();
            const newId = shifts.length > 0 ? Math.max(...shifts.map(s => parseInt(s.id))) + 1 : 1;
            
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: 'Подработки!A:G',
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        newId,
                        shiftData.date,
                        shiftData.time,
                        shiftData.department,
                        shiftData.requiredPeople,
                        '',
                        'active'
                    ]]
                }
            });
            
            // Сбрасываем сессию
            ctx.session.creatingShift = false;
            ctx.session.shiftData = {};
            
            await ctx.reply(
                '✅ *СМЕНА УСПЕШНО СОЗДАНА!*\n\n' +
                `📅 Дата: ${shiftData.date}\n` +
                `⏰ Время: ${shiftData.time}\n` +
                `🏢 Отдел: ${shiftData.department}\n` +
                `👥 Нужно человек: ${shiftData.requiredPeople}\n\n` +
                'Теперь сотрудники могут записываться на эту смену! 🚀',
                { parse_mode: 'Markdown' }
            );
        }
        
    } catch (error) {
        console.error('Ошибка при создании смены:', error);
        await ctx.reply('❌ Ошибка при создании смены. Попробуйте снова.');
        ctx.session.creatingShift = false;
        ctx.session.shiftData = {};
    }
    return;
}

    // Обработка действий администратора
    if (ctx.session.adminAction) {
        try {
            const userId = parseInt(ctx.message.text);
            
            if (isNaN(userId)) {
                await ctx.reply('❌ Неверный формат ID. Введите числовой ID пользователя.');
                return;
            }

            if (ctx.session.adminAction === 'add') {
                await addAdmin(userId);
                await ctx.reply(`✅ Пользователь ${userId} добавлен в администраторы.`);
            } else if (ctx.session.adminAction === 'remove') {
                if (userId === SUPER_ADMIN_ID) {
                    await ctx.reply('❌ Нельзя удалить супер-администратора.');
                    return;
                }
                await removeAdmin(userId);
                await ctx.reply(`✅ Пользователь ${userId} удален из администраторов.`);
            }

            ctx.session.adminAction = null;
            return;

        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
            ctx.session.adminAction = null;
            return;
        }
    }

    // Обычная обработка ФИО
    const fio = ctx.message.text.trim();
    console.log('Получено ФИО:', fio);
    
    try {
        if (!validateFIO(fio)) {
            const errorMessage = `❌ *Некорректный формат ФИО*\n\n` +
                               `📋 Правильный формат: *Фамилия Имя Отчество*\n` +
                               `Пример: *Иванов Иван Иванович*\n\n` +
                               `Пожалуйста, отправьте ФИО в правильном формате.`;
            
            await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
            return;
        }
        
        const employeeExists = await checkEmployeeExists(fio);
        if (!employeeExists) {
            const notFoundMessage = `🔍 *Информация не найдена*\n\n` +
                                  `По сотруднику *${fio}* данных не обнаружено.\n\n` +
                                  `Возможные причины:\n` +
                                  `• ФИО введено с ошибкой\n` +
                                  `• Сотрудник не внесен в систему\n` +
                                  `• Данные еще не обновлены\n\n` +
                                  `📝 Попробуйте другое ФИО или проверьте правильность написания.`;
            
            await ctx.reply(notFoundMessage, { parse_mode: 'Markdown' });
            return;
        }
        
        ctx.session.fullFio = fio;
        const [lastName, firstName, patronymic] = fio.split(' ');
        const shortFio = `${lastName.slice(0, 3)}${firstName.slice(0, 3)}${patronymic.slice(0, 3)}`;
        const userId = ctx.from.id;
        
        const isUserAdmin = await isAdmin(userId);
        const menuMessage = `👤 *${fio}*\n\n` +
                           `📊 *Выберите раздел для просмотра статистики:*\n\n` +
                           `▫️ *📊 Ошибки* - количество рабочих ошибок\n` +
                           `▫️ *📅 Табель* - информация о сменах\n` +
                           `▫️ *🚀 Производительность* - показатели эффективности\n\n` +
                           `${isUserAdmin ? '⚡ *Режим администратора активирован*\n• Используйте /podrabotka для создания смен' : ''}`;
        
        await ctx.reply(menuMessage, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: createMainMenu(shortFio, userId, fio) }
        });
        
    } catch (error) {
        console.error('Ошибка при обработке ФИО:', error);
        const errorMessage = `⚠️ *Произошла ошибка*\n\n` +
                           `При обработке вашего запроса возникла проблема.\n\n` +
                           `Пожалуйста, попробуйте позже или обратитесь к администратору.`;
        
        await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
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
        throw new Error('Не удалось получить данные из таблицы');
    }
}

async function getErrorCount(fio) {
    try {
        const rows = await getSheetData('Ошибки!A:C');
        const errors = rows.filter(row => row[0] === fio);
        return errors.length;
    } catch (error) {
        console.error('Ошибка при получении ошибок:', error);
        throw new Error('Не удалось получить данные об ошибках');
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
        throw new Error('Не удалось получить данные отбора');
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
        throw new Error('Не удалось получить данные размещения');
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
        throw new Error('Не удалось получить данные производительности');
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
        throw new Error('Не удалось получить данные табеля');
    }
}

// Обработчики для панели супер-администратора
bot.action('admin_list', async (ctx) => {
    try {
        if (ctx.from.id !== SUPER_ADMIN_ID) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const admins = await getAdmins();
        let message = '👥 *СПИСОК АДМИНИСТРАТОРОВ:*\n\n';
        message += `👑 Супер-админ: ${SUPER_ADMIN_ID} (Вы)\n\n`;
        
        if (admins.length > 1) {
            admins.filter(id => id !== SUPER_ADMIN_ID).forEach((adminId, index) => {
                message += `${index + 1}. ${adminId}\n`;
            });
        } else {
            message += '📭 Других администраторов нет';
        }

        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '↩️ Назад', callback_data: 'admin_back' }
                ]]
            }
        });
    } catch (error) {
        console.error('Ошибка при получении списка админов:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке списка');
    }
});

bot.action('admin_add', async (ctx) => {
    try {
        if (ctx.from.id !== SUPER_ADMIN_ID) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        ctx.session.adminAction = 'add';
        await ctx.editMessageText('➕ *ДОБАВЛЕНИЕ АДМИНИСТРАТОРА*\n\nВведите ID пользователя:', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Отмена', callback_data: 'admin_back' }
                ]]
            }
        });
    } catch (error) {
        console.error('Ошибка при добавлении админа:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

bot.action('admin_remove', async (ctx) => {
    try {
        if (ctx.from.id !== SUPER_ADMIN_ID) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        ctx.session.adminAction = 'remove';
        await ctx.editMessageText('➖ *УДАЛЕНИЕ АДМИНИСТРАТОРА*\n\nВведите ID пользователя:', {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '❌ Отмена', callback_data: 'admin_back' }
                ]]
            }
        });
    } catch (error) {
        console.error('Ошибка при удалении админа:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

bot.action('admin_stats', async (ctx) => {
    try {
        if (ctx.from.id !== SUPER_ADMIN_ID) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const admins = await getAdmins();
        const shifts = await getAvailableShifts();
        
        const message = `📊 *СТАТИСТИКА СИСТЕМЫ:*\n\n` +
                       `👥 Администраторов: ${admins.length}\n` +
                       `📅 Активных смен: ${shifts.length}\n` +
                       `👤 Всего записей на смены: ${shifts.reduce((acc, shift) => acc + shift.signedUp.length, 0)}\n\n` +
                       `🆔 Ваш ID: ${SUPER_ADMIN_ID}`;

        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '↩️ Назад', callback_data: 'admin_back' }
                ]]
            }
        });
    } catch (error) {
        console.error('Ошибка при получении статистики:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке статистики');
    }
});

bot.action('admin_close', async (ctx) => {
    await ctx.deleteMessage();
    await ctx.answerCbQuery('Панель закрыта');
});

bot.action('admin_back', async (ctx) => {
    try {
        if (ctx.from.id !== SUPER_ADMIN_ID) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const adminMenu = [
            [
                { text: '👥 Список админов', callback_data: 'admin_list' },
                { text: '➕ Добавить админа', callback_data: 'admin_add' }
            ],
            [
                { text: '➖ Удалить админа', callback_data: 'admin_remove' },
                { text: '📊 Статистика', callback_data: 'admin_stats' }
            ],
            [
                { text: '❌ Закрыть', callback_data: 'admin_close' }
            ]
        ];

        await ctx.editMessageText('👑 *ПАНЕЛЬ СУПЕР-АДМИНИСТРАТОРА*', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: adminMenu }
        });
    } catch (error) {
        console.error('Ошибка при возврате в меню админа:', error);
        await ctx.answerCbQuery('❌ Ошибка');
    }
});

// Обработчик callback-запросов
bot.action(/^(e|p|t|back)_/, async (ctx) => {
    try {
        const callbackData = ctx.callbackQuery.data;
        const [action, shortFio, userId] = callbackData.split('_');
        const fullFio = ctx.session?.fullFio;

        console.log('Обработчик вызван:', { action, shortFio, userId });

        if (action === 'back') {
            const menuMessage = `👤 *${fullFio}*\n\n` +
                               `📊 *Выберите раздел для просмотра статистики:*`;
            
            await ctx.editMessageText(menuMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createMainMenu(shortFio, userId, fullFio) }
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
                    const errorMessage = `📊 *СТАТИСТИКА ОШИБОК*\n\n` +
                                       `👤 *Сотрудник:* ${fullFio}\n` +
                                       `📅 *Период:* все время\n\n` +
                                       `❌ *Общее количество ошибок:* ${errorCount}\n\n` +
                                       `💡 *Примечание:* учитываются все зафиксированные ошибки в работе`;
                    
                    await ctx.editMessageText(errorMessage, {
                        parse_mode: 'Markdown',
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
                    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                                      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
                    
                    for (let i = 0; i < 6; i++) {
                        const monthDate = new Date(currentYear, currentMonth - i, 1);
                        const monthName = monthNames[monthDate.getMonth()];
                        const year = monthDate.getFullYear();
                        const monthIndex = monthDate.getMonth();
                        
                        monthKeyboard.push([
                            { 
                                text: `📅 ${monthName} ${year}`, 
                                callback_data: `month_${monthIndex}_${year}_${shortFio}_${userId}`
                            }
                        ]);
                    }
                    
                    monthKeyboard.push([{ 
                        text: '↩️ Назад в меню', 
                        callback_data: `back_${shortFio}_${userId}` 
                    }]);
                    
                    const productivityMessage = `🚀 *АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ*\n\n` +
                                              `👤 *Сотрудник:* ${fullFio}\n\n` +
                                              `📊 *Выберите месяц для анализа:*\n\n` +
                                              `Доступны данные за последние 6 месяцев`;
                    
                    await ctx.editMessageText(productivityMessage, {
                        parse_mode: 'Markdown',
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

                    const message = `📊 *ТАБЕЛЬ ДЛЯ ${fullFio}:*\n\n` +
                                  `📅 График: ${shiftData.plannedShifts} смен\n` +
                                  `➕ Доп. смены: ${shiftData.extraShifts}\n` +
                                  `❌ Прогулы: ${shiftData.absences}\n` +
                                  `💪 Усиления: ${shiftData.reinforcementShifts}\n` +
                                  `✅ Всего отработано: ${totalWorked} смен\n` +
                                  `📈 Посещаемость: ${attendanceRate.toFixed(2)}%`;

                    await ctx.editMessageText(message, {
                        parse_mode: 'Markdown',
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

// 4. Добавляем обработчики для просмотра смен и заявок
bot.action(/^shifts_list_/, async (ctx) => {
    try {
        const [action, shortFio, userId] = ctx.callbackQuery.data.split('_');
        const fullFio = ctx.session?.fullFio;

        const availableShifts = await getAvailableShifts();
        
        if (availableShifts.length === 0) {
            await ctx.editMessageText('📭 *На данный момент нет доступных смен для подработки.*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: `work_${shortFio}_${userId}` }]] }
            });
            return;
        }

        const shiftsKeyboard = availableShifts.map(shift => [
            { 
                text: `📅 ${shift.date} ${shift.time} (${shift.department})`, 
                callback_data: `shift_detail_${shift.id}_${shortFio}_${userId}`
            }
        ]);

        shiftsKeyboard.push([{ text: '↩️ Назад', callback_data: `work_${shortFio}_${userId}` }]);

        await ctx.editMessageText('📋 *ДОСТУПНЫЕ СМЕНЫ ДЛЯ ПОДРАБОТКИ:*', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: shiftsKeyboard }
        });
        
    } catch (error) {
        console.error('Ошибка при получении списка смен:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке смен');
    }
});

bot.action(/^shift_detail_/, async (ctx) => {
    try {
        const [action, shiftId, shortFio, userId] = ctx.callbackQuery.data.split('_');
        const fullFio = ctx.session?.fullFio;

        console.log('Поиск смены с ID:', shiftId);
        
        const shift = await getShiftById(shiftId);
        
        if (!shift) {
            console.log('Смена не найдена. Доступные смены:', await getAvailableShifts());
            await ctx.answerCbQuery('❌ Смена не найдена');
            return;
        }

        console.log('Найдена смена:', shift);
        
        const shiftInfo = `📅 *ДЕТАЛИ СМЕНЫ*\n\n` +
                         `🗓️ *Дата:* ${shift.date}\n` +
                         `⏰ *Время:* ${shift.time}\n` +
                         `🏢 *Отдел:* ${shift.department}\n` +
                         `👥 *Требуется человек:* ${shift.requiredPeople}\n` +
                         `✅ *Записалось:* ${shift.signedUp.length}/${shift.requiredPeople}\n\n`;

        const detailKeyboard = [
            [
                { 
                    text: '📝 Записаться на смену', 
                    callback_data: `signup_shift_${shiftId}_${shortFio}_${userId}`
                }
            ],
            [
                { text: '↩️ К списку смен', callback_data: `shifts_list_${shortFio}_${userId}` }
            ]
        ];

        await ctx.editMessageText(shiftInfo, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: detailKeyboard }
        });
        
    } catch (error) {
        console.error('Ошибка при получении деталей смены:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке деталей смены');
    }
});

bot.action(/^signup_shift_/, async (ctx) => {
    try {
        const [action, shiftId, shortFio, userId] = ctx.callbackQuery.data.split('_');
        const fullFio = ctx.session?.fullFio;

        const success = await signUpForShift(userId, fullFio, shiftId);
        
        if (success) {
            await ctx.answerCbQuery('✅ Вы успешно записаны на смену!');
            
            await ctx.editMessageText('✅ *ВЫ УСПЕШНО ЗАПИСАНЫ НА СМЕНУ!*\n\nОжидайте подтверждения от администратора.', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createBackButton(shortFio, userId) }
            });
        }
        
    } catch (error) {
        console.error('Ошибка при записи на смену:', error);
        await ctx.answerCbQuery(`❌ ${error.message}`);
    }
});

bot.action(/^my_applications_/, async (ctx) => {
    try {
        const [action, shortFio, userId] = ctx.callbackQuery.data.split('_');
        const fullFio = ctx.session?.fullFio;

        const applications = await getUserApplications(fullFio);

        if (applications.length === 0) {
            await ctx.editMessageText('📭 *У вас нет активных заявок на подработку.*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: `work_${shortFio}_${userId}` }]] }
            });
            return;
        }

        let message = '📋 *МОИ ЗАЯВКИ НА ПОДРАБОТКУ:*\n\n';
        
        applications.forEach((app, index) => {
            message += `${index + 1}. ${app.date} ${app.time} - ${app.department}\n`;
            message += `   👥 ${app.signedUp.length}/${app.requiredPeople} человек\n`;
            message += `   📝 Статус: активна\n\n`;
        });

        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: `work_${shortFio}_${userId}` }]] }
        });
        
    } catch (error) {
        console.error('Ошибка при получении заявок:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке заявок');
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

        const totalSelection = productivityData.totalRmSelection + productivityData.totalOsSelection;
        const totalPlacement = productivityData.totalRmPlacement + productivityData.totalOsPlacement;

        const message = `🚀 *ПРОИЗВОДИТЕЛЬНОСТЬ ЗА ${monthName.toUpperCase()} ${year}*\n\n` +
                       `👤 *Сотрудник:* ${fullFio}\n\n` +
                       `📦 *ОТБОР ТОВАРА*\n` +
                       `├ ОС: ${productivityData.totalOsSelection} ед.\n` +
                       `├ РМ: ${productivityData.totalRmSelection} ед.\n` +
                       `└ *Всего:* ${totalSelection} ед.\n\n` +
                       `📋 *РАЗМЕЩЕНИЕ ТОВАРА*\n` +
                       `├ ОС: ${productivityData.totalOsPlacement} ед.\n` +
                       `├ РМ: ${productivityData.totalRmPlacement} ед.\n` +
                       `└ *Всего:* ${totalPlacement} ед.\n\n` +
                       `📈 *ОБЩАЯ СТАТИСТИКА*\n` +
                       `├ Дней с данными: ${productivityData.daysWithData}\n` +
                       `├ Средний отбор/день: ${productivityData.avgSelectionPerDay} ед.\n` +
                       `└ Среднее размещение/день: ${productivityData.avgPlacementPerDay} ед.\n\n`;
        
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
        await ctx.editMessageText('❌ Не удалось получить данные производительности. Попробуйте позже.', {
            reply_markup: { inline_keyboard: createBackButton(parts[3], parts[4]) }
        });
        await ctx.answerCbQuery();
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

        let message = `📋 *ДЕТАЛИЗАЦИЯ ПО ДНЯМ*\n\n`;
        message += `👤 *Сотрудник:* ${fullFio}\n`;
        message += `📅 *Период:* ${monthNames[month]} ${year}\n\n`;
        message += `*Ежедневная статистика:*\n\n`;

        let hasData = false;
        
        for (let day = 1; day <= 31; day++) {
            const hasSelection = selectionData[`rm_day_${day}`] > 0 || selectionData[`os_day_${day}`] > 0;
            const hasPlacement = placementData[`rm_day_${day}`] > 0 || placementData[`os_day_${day}`] > 0;
            
            if (hasSelection || hasPlacement) {
                hasData = true;
                
                message += `📅 *${day.toString().padStart(2, '0')}.${(month + 1).toString().padStart(2, '0')}.*\n`;
                
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
            message += `📭 *Данные отсутствуют*\n\nЗа выбранный период активность не зафиксирована.`;
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
        await ctx.editMessageText('❌ Не удалось получить детализированные данные. Попробуйте позже.', {
            reply_markup: { inline_keyboard: createBackButton(parts[3], parts[4]) }
        });
        await ctx.answerCbQuery();
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
        console.log(`👑 Супер-администратор: ${SUPER_ADMIN_ID}`);
        console.log('📝 Для создания смены используйте команду: /podrabotka');
        
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