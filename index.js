const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');
const LocalSession = require('telegraf-session-local');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Загрузка конфигурации из переменных окружения
const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SUPER_ADMIN_ID = parseInt(process.env.SUPER_ADMIN_ID) || 566632489;

// Проверка обязательных переменных
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN не настроен в переменных окружения');
    process.exit(1);
}

if (!SPREADSHEET_ID) {
    console.error('❌ SPREADSHEET_ID не настроен в переменных окружения');
    process.exit(1);
}

// Глобальные переменные
let googleSheetsClient = null;
let botInstance = null;

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
        const result = await googleSheetsClient.spreadsheets.values.get({
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
        const currentAdmins = await getAdmins();
        
        if (currentAdmins.includes(userId)) {
            throw new Error('Пользователь уже является администратором');
        }
        
        await googleSheetsClient.spreadsheets.values.append({
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
        const result = await googleSheetsClient.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Администраторы!A:A'
        });
        
        const rows = result.data.values || [];
        const updatedRows = rows.filter((row, index) => {
            if (index === 0) return true;
            if (parseInt(row[0]) === SUPER_ADMIN_ID) return true;
            return parseInt(row[0]) !== userId;
        });
        
        await googleSheetsClient.spreadsheets.values.update({
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
        
        const tablesToCheck = ['Ошибки!A:A', 'Табель!A:Z', 'Отбор!A:A', 'Размещение!A:A'];
        
        for (const range of tablesToCheck) {
            try {
                const result = await googleSheetsClient.spreadsheets.values.get({
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
        const result = await googleSheetsClient.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Подработки!A:I'
        });
        
        const rows = result.data.values || [];
        if (rows.length < 2) return [];
        
        const shifts = [];
        
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            
            // Создаем объект смены с значениями по умолчанию
            const shift = {
                id: row[0]?.toString() || i.toString(),
                date: row[1] || 'Не указана',
                time: row[2] || 'Не указано',
                department: row[3] || 'Не указан',
                requiredPeople: parseInt(row[4] || 0),
                signedUp: [],
                status: row[6] || 'active',
                pendingApproval: [],
                approved: []
            };
            
            // Обрабатываем списки
            if (row[5]) shift.signedUp = row[5].split(',').filter(Boolean);
            if (row[7]) shift.pendingApproval = row[7].split(',').filter(Boolean);
            if (row[8]) shift.approved = row[8].split(',').filter(Boolean);
            
            // Фильтруем только активные смены
            if (shift.status === 'active') {
                shifts.push(shift);
            }
        }
        
        console.log(`Найдено ${shifts.length} активных смен`);
        return shifts;
        
    } catch (error) {
        console.error('Ошибка при получении смен:', error);
        return [];
    }
}

async function updateShiftInSheet(shift) {
    try {
        // Находим номер строки смены
        const result = await googleSheetsClient.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Подработки!A:A'
        });
        
        const rows = result.data.values || [];
        let rowIndex = -1;
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][0] && rows[i][0].toString() === shift.id.toString()) {
                rowIndex = i + 1; // +1 потому что строки в Google Sheets начинаются с 1
                break;
            }
        }
        
        if (rowIndex === -1) {
            throw new Error('Смена не найдена в таблице');
        }
        
        // Обновляем данные смены
        await googleSheetsClient.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Подработки!A${rowIndex}:I${rowIndex}`,
            valueInputOption: 'RAW',
            resource: {
                values: [[
                    shift.id,
                    shift.date,
                    shift.time,
                    shift.department,
                    shift.requiredPeople,
                    shift.signedUp.join(','),
                    shift.status,
                    shift.pendingApproval.join(','),
                    shift.approved.join(',')
                ]]
            }
        });
        
        return true;
    } catch (error) {
        console.error('Ошибка при обновлении смены:', error);
        throw error;
    }
}

// ДОБАВЬТЕ эту функцию для отладки (она поможет понять структуру данных):
async function debugShiftTable() {
    try {
        const result = await googleSheetsClient.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Подработки!A:I'
        });
        
        const rows = result.data.values || [];
        console.log('=== ДЕБАГ ТАБЛИЦЫ ПОДРАБОТОК ===');
        console.log('Заголовки:', rows[0] || 'Нет заголовков');
        
        for (let i = 1; i < rows.length; i++) {
            console.log(`Строка ${i}:`, rows[i]);
        }
        console.log('=== КОНЕЦ ДЕБАГА ===');
        
        return rows;
    } catch (error) {
        console.error('Ошибка при отладке таблицы:', error);
        return [];
    }
}

async function signUpForShift(userId, userName, shiftId) {
    try {
        const shifts = await getAvailableShifts();
        const shift = shifts.find(s => s.id.toString() === shiftId.toString());
        
        if (!shift) {
            throw new Error('Смена не найдена');
        }
        
        if (shift.signedUp.includes(userName) || shift.pendingApproval.includes(userName) || shift.approved.includes(userName)) {
            throw new Error('Вы уже подали заявку на эту смену');
        }
        
        if ((shift.approved.length + shift.pendingApproval.length) >= shift.requiredPeople) {
            throw new Error('На эту смену уже набрано достаточно людей');
        }
        
        // Добавляем в ожидающие подтверждения
        shift.pendingApproval.push(userName);
        await updateShiftInSheet(shift);
        
        return true;
    } catch (error) {
        console.error('Ошибка при записи на смену:', error);
        throw error;
    }
}

async function approveApplication(shiftId, userName, adminId) {
    try {
        const shifts = await getAvailableShifts();
        const shift = shifts.find(s => s.id.toString() === shiftId.toString());
        
        if (!shift) {
            throw new Error('Смена не найдена');
        }
        
        if (!shift.pendingApproval.includes(userName)) {
            throw new Error('Заявка не найдена в ожидающих');
        }
        
        // Переносим из pending в approved
        shift.pendingApproval = shift.pendingApproval.filter(name => name !== userName);
        shift.approved.push(userName);
        
        await updateShiftInSheet(shift);
        
        return { success: true, shift };
    } catch (error) {
        console.error('Ошибка при подтверждении заявки:', error);
        throw error;
    }
}

async function rejectApplication(shiftId, userName, adminId) {
    try {
        const shifts = await getAvailableShifts();
        const shift = shifts.find(s => s.id.toString() === shiftId.toString());
        
        if (!shift) {
            throw new Error('Смена не найдена');
        }
        
        if (!shift.pendingApproval.includes(userName)) {
            throw new Error('Заявка не найдена в ожидающих');
        }
        
        // Удаляем из pending
        shift.pendingApproval = shift.pendingApproval.filter(name => name !== userName);
        
        await updateShiftInSheet(shift);
        
        return { success: true, shift };
    } catch (error) {
        console.error('Ошибка при отклонении заявки:', error);
        throw error;
    }
}

async function getPendingApplications() {
    try {
        const shifts = await getAvailableShifts();
        const applications = [];
        
        for (const shift of shifts) {
            for (const userName of shift.pendingApproval) {
                applications.push({
                    shiftId: shift.id,
                    userName: userName,
                    date: shift.date,
                    time: shift.time,
                    department: shift.department,
                    shift: shift
                });
            }
        }
        
        return applications;
    } catch (error) {
        console.error('Ошибка при получении заявок:', error);
        return [];
    }
}

async function getUserApplications(userName) {
    try {
        const shifts = await getAvailableShifts();
        return shifts.filter(shift => 
            shift.signedUp.includes(userName) || 
            shift.pendingApproval.includes(userName) || 
            shift.approved.includes(userName)
        );
    } catch (error) {
        console.error('Ошибка при получении заявок:', error);
        return [];
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
        await googleSheetsClient.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
        
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
botInstance = bot;

// Middleware для сессий
bot.use((new LocalSession({ 
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
function createMainMenu(isAdmin = false) {
    const menu = [
        [
            { 
                text: '📊 Ошибки', 
                callback_data: 'menu_show_errors'
            },
            { 
                text: '📅 Табель', 
                callback_data: 'menu_show_timesheet'
            }
        ],
        [
            { 
                text: '🚀 Производительность', 
                callback_data: 'menu_show_productivity'
            },
            { 
                text: '💼 Подработки', 
                callback_data: 'menu_show_work'
            }
        ]
    ];

    if (isAdmin) {
        menu.push([
            { 
                text: '👑 Админ-панель', 
                callback_data: 'menu_admin_panel'
            }
        ]);
    }

    menu.push([
        { 
            text: '🔄 Сменить ФИО', 
            callback_data: 'menu_change_fio'
        }
    ]);

    return menu;
}

// Функция для создания кнопки "Назад в меню"
function createBackButton(backTo = 'menu_back_main') {
    return [
        [{ 
            text: '↩️ Назад', 
            callback_data: backTo
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
                              `${isUserAdmin ? '⚡ *Вы администратор системы*' : ''}\n\n` +
                              `📝 *Отправьте ваше ФИО* (Фамилия Имя Отчество) для начала работы.`;
        
        await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Ошибка при ответе на /start:', error);
    }
});

// Команда /admin для админов
bot.command('admin', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            await ctx.reply('❌ Недостаточно прав для выполнения этой команды.');
            return;
        }

        const adminMenu = [
            [
                { text: '📋 Заявки на подработку', callback_data: 'admin_applications' },
                { text: '📅 Управление сменами', callback_data: 'admin_shifts' }
            ],
            [
                { text: '👥 Управление админами', callback_data: 'admin_manage' },
                { text: '📊 Статистика', callback_data: 'admin_stats' }
            ],
            [
                { text: '↩️ Главное меню', callback_data: 'menu_back_main' }
            ]
        ];

        await ctx.reply('👑 *ПАНЕЛЬ АДМИНИСТРАТОРА*', {
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

// Обработчик для отмены создания
bot.action('cancel_creation', async (ctx) => {
    ctx.session.creatingShift = false;
    ctx.session.shiftData = {};
    await ctx.editMessageText('❌ Создание смены отменено.');
    await ctx.answerCbQuery();
});

// Обработчик для смене ФИО
bot.action('menu_change_fio', async (ctx) => {
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

// ДОБАВЬТЕ команду для отладки
bot.command('debug_table', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            await ctx.reply('❌ Недостаточно прав!');
            return;
        }

        const rows = await debugShiftTable();
        await ctx.reply(`✅ Таблица проанализирована. Всего строк: ${rows.length}`);
    } catch (error) {
        console.error('Ошибка при отладке:', error);
        await ctx.reply('❌ Ошибка при отладке таблицы');
    }
});

// Обработчик для меню подработок
bot.action('menu_show_work', async (ctx) => {
    try {
        const fullFio = ctx.session.userFio;

        if (!fullFio) {
            await ctx.answerCbQuery('❌ ФИО не найдено. Отправьте ФИО снова.');
            return;
        }

        const workMenu = [
            [
                { text: '📋 Доступные смены', callback_data: 'work_shifts_list' },
                { text: '📝 Мои заявки', callback_data: 'work_my_applications' }
            ],
            [
                { text: '↩️ Назад в меню', callback_data: 'menu_back_main' }
            ]
        ];

        await ctx.editMessageText(`💼 *СИСТЕМА ПОДРАБОТОК*\n\n👤 Сотрудник: ${fullFio}`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: workMenu }
        });
    } catch (error) {
        console.error('Ошибка при открытии меню подработок:', error);
        await ctx.editMessageText('❌ Не удалось открыть меню подработок.', {
            reply_markup: { inline_keyboard: createBackButton() }
        });
    }
});

// Функция валидации ФИО
function validateFIO(fio) {
    const parts = fio.trim().replace(/\s+/g, ' ').split(' ');
    return parts.length === 3 && parts.every(part => /^[A-Za-zА-Яа-яЁё\-]+$/.test(part));
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
                    await ctx.reply('❌ Неверный формат дати. Используйте ДД.ММ.ГГГГ\nПример: 15.01.2024');
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
                const shifts = await getAvailableShifts();
                const newId = shifts.length > 0 ? Math.max(...shifts.map(s => parseInt(s.id))) + 1 : 1;
                
                await googleSheetsClient.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: 'Подработки!A:I',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [[
                            newId,
                            shiftData.date,
                            shiftData.time,
                            shiftData.department,
                            shiftData.requiredPeople,
                            '',
                            'active',
                            '',
                            ''
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
        
        // Сохраняем в сессии вместо передачи в callback
        ctx.session.userFio = fio;
        const [lastName, firstName, patronymic] = fio.split(' ');
        ctx.session.shortFio = `${lastName.slice(0, 3)}${firstName.slice(0, 3)}${patronymic.slice(0, 3)}`;
        ctx.session.userId = ctx.from.id;
        
        const isUserAdmin = await isAdmin(ctx.from.id);
        const menuMessage = `👤 *${fio}*\n\n` +
                           `📊 *Выберите раздел для просмотра статистики:*\n\n` +
                           `▫️ *📊 Ошибки* - количество рабочих ошибок\n` +
                           `▫️ *📅 Табель* - информация о сменах\n` +
                           `▫️ *🚀 Производительность* - показатели эффективности\n\n` +
                           `${isUserAdmin ? '⚡ *Режим администратора активирован*' : ''}`;
        
        await ctx.reply(menuMessage, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: createMainMenu(isUserAdmin) }
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
        const result = await googleSheetsClient.spreadsheets.values.get({
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

// Обработчики для админ-панели
bot.action('menu_admin_panel', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const adminMenu = [
            [
                { text: '📋 Заявки на подработку', callback_data: 'admin_applications' },
                { text: '📅 Управление сменами', callback_data: 'admin_shifts' }
            ],
            [
                { text: '👥 Управление админами', callback_data: 'admin_manage' },
                { text: '📊 Статистика', callback_data: 'admin_stats' }
            ],
            [
                { text: '↩️ Главное меню', callback_data: 'menu_back_main' }
            ]
        ];

        await ctx.editMessageText('👑 *ПАНЕЛЬ АДМИНИСТРАТОРА*', {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: adminMenu }
        });
    } catch (error) {
        console.error('Ошибка при открытии админ-панели:', error);
        await ctx.answerCbQuery('❌ Ошибка при открытии панели');
    }
});

// Меню управления заявками администратора
bot.action('admin_applications', async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const applications = await getPendingApplications();
        
        if (applications.length === 0) {
            await ctx.editMessageText('📭 *Нет заявок на подработку для рассмотрения*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createBackButton('menu_admin_panel') }
            });
            return;
        }

        // Сохраняем заявки в сессии для дальнейшего использования
        ctx.session.pendingApplications = applications;

        const applicationsKeyboard = applications.map((app, index) => [
            { 
                text: `📝 ${app.userName} - ${app.date} ${app.time}`, 
                callback_data: `admin_app_detail_${index}`
            }
        ]);

        applicationsKeyboard.push(createBackButton('menu_admin_panel')[0]);

        await ctx.editMessageText(`📋 *ЗАЯВКИ НА ПОДРАБОТКУ*\n\nНайдено ${applications.length} заявок на рассмотрение:`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: applicationsKeyboard }
        });

    } catch (error) {
        console.error('Ошибка при получении заявок:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке заявок');
    }
});

// Детали заявки для администратора
bot.action(/^admin_app_detail_/, async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const index = parseInt(ctx.callbackQuery.data.split('_')[3]);
        const application = ctx.session.pendingApplications[index];
        
        if (!application) {
            await ctx.answerCbQuery('❌ Заявка не найдена');
            return;
        }

        const message = `📋 *ДЕТАЛИ ЗАЯВКИ*\n\n` +
                       `👤 *Сотрудник:* ${application.userName}\n` +
                       `📅 *Дата:* ${application.date}\n` +
                       `⏰ *Время:* ${application.time}\n` +
                       `🏢 *Отдел:* ${application.department}\n` +
                       `🆔 *ID смены:* ${application.shiftId}\n\n` +
                       `✅ *Подтверждено:* ${application.shift.approved.length}/${application.shift.requiredPeople}\n` +
                       `⏳ *Ожидают:* ${application.shift.pendingApproval.length}`;

        const actionKeyboard = [
            [
                { 
                    text: '✅ Подтвердить', 
                    callback_data: `admin_app_approve_${index}`
                },
                { 
                    text: '❌ Отклонить', 
                    callback_data: `admin_app_reject_${index}`
                }
            ],
            [
                { 
                    text: '↩️ К списку заявок', 
                    callback_data: 'admin_applications'
                }
            ]
        ];

        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: actionKeyboard }
        });

    } catch (error) {
        console.error('Ошибка при получении деталей заявки:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке деталей');
    }
});

// Подтверждение заявки администратором
bot.action(/^admin_app_approve_/, async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const index = parseInt(ctx.callbackQuery.data.split('_')[3]);
        const application = ctx.session.pendingApplications[index];
        
        if (!application) {
            await ctx.answerCbQuery('❌ Заявка не найдена');
            return;
        }

        const result = await approveApplication(
            application.shiftId, 
            application.userName, 
            ctx.from.id
        );

        if (result.success) {
            await ctx.answerCbQuery('✅ Заявка подтверждена!');
            
            // Обновляем список заявок в сессии
            ctx.session.pendingApplications = await getPendingApplications();
            
            const message = `✅ *ЗАЯВКА ПОДТВЕРЖДЕНА!*\n\n` +
                           `👤 Сотрудник: ${application.userName}\n` +
                           `📅 Смена: ${application.date} ${application.time}\n` +
                           `🏢 Отдел: ${application.department}\n\n` +
                           `✅ Подтверждено: ${result.shift.approved.length}/${result.shift.requiredPeople}`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createBackButton('admin_applications') }
            });

            // TODO: Отправить уведомление сотруднику о подтверждении
        }

    } catch (error) {
        console.error('Ошибка при подтверждении заявки:', error);
        await ctx.answerCbQuery('❌ Ошибка при подтверждении');
    }
});

// Отклонение заявки администратором
bot.action(/^admin_app_reject_/, async (ctx) => {
    try {
        if (!await isAdmin(ctx.from.id)) {
            await ctx.answerCbQuery('❌ Недостаточно прав!');
            return;
        }

        const index = parseInt(ctx.callbackQuery.data.split('_')[3]);
        const application = ctx.session.pendingApplications[index];
        
        if (!application) {
            await ctx.answerCbQuery('❌ Заявка не найдена');
            return;
        }

        const result = await rejectApplication(
            application.shiftId, 
            application.userName, 
            ctx.from.id
        );

        if (result.success) {
            await ctx.answerCbQuery('❌ Заявка отклонена!');
            
            // Обновляем список заявок в сессии
            ctx.session.pendingApplications = await getPendingApplications();
            
            const message = `❌ *ЗАЯВКА ОТКЛОНЕНА!*\n\n` +
                           `👤 Сотрудник: ${application.userName}\n` +
                           `📅 Смена: ${application.date} ${application.time}\n` +
                           `🏢 Отдел: ${application.department}`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createBackButton('admin_applications') }
            });

            // TODO: Отправить уведомление сотруднику об отклонении
        }

    } catch (error) {
        console.error('Ошибка при отклонении заявки:', error);
        await ctx.answerCbQuery('❌ Ошибка при отклонении');
    }
});

// Обработчики для основного меню
bot.action(/^menu_/, async (ctx) => {
    try {
        const callbackData = ctx.callbackQuery.data;
        const fullFio = ctx.session.userFio;

        if (!fullFio) {
            await ctx.answerCbQuery('❌ ФИО не найдено. Отправьте ФИО снова.');
            return;
        }

        if (callbackData === 'menu_back_main') {
            const isUserAdmin = await isAdmin(ctx.from.id);
            const menuMessage = `👤 *${fullFio}*\n\n` +
                               `📊 *Выберите раздел для просмотра статистики:*`;
            
            await ctx.editMessageText(menuMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createMainMenu(isUserAdmin) }
            });
            await ctx.answerCbQuery();
            return;
        }

        switch (callbackData) {
            case 'menu_show_errors':
                try {
                    const errorCount = await getErrorCount(fullFio);
                    const errorMessage = `📊 *СТАТИСТИКА ОШИБОК*\n\n` +
                                       `👤 *Сотрудник:* ${fullFio}\n` +
                                       `📅 *Период:* все время\n\n` +
                                       `❌ *Общее количество ошибок:* ${errorCount}\n\n` +
                                       `💡 *Примечание:* учитываются все зафиксированные ошибки в работе`;
                    
                    await ctx.editMessageText(errorMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: createBackButton() }
                    });
                } catch (error) {
                    console.error('Ошибка при получении ошибок:', error);
                    await ctx.editMessageText('❌ Не удалось получить данные об ошибках.', {
                        reply_markup: { inline_keyboard: createBackButton() }
                    });
                }
                break;
                
            case 'menu_show_productivity':
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
                                callback_data: `month_${monthIndex}_${year}`
                            }
                        ]);
                    }
                    
                    monthKeyboard.push([{ 
                        text: '↩️ Назад в меню', 
                        callback_data: 'menu_back_main' 
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
                        reply_markup: { inline_keyboard: createBackButton() }
                    });
                }
                break;
                
            case 'menu_show_timesheet':
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
                        reply_markup: { inline_keyboard: createBackButton() }
                    });
                } catch (error) {
                    console.error('Ошибка при получении данных табеля:', error);
                    await ctx.editMessageText('❌ Не удалось получить данные табеля.', {
                        reply_markup: { inline_keyboard: createBackButton() }
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

// Обработчики для подработок
bot.action('work_shifts_list', async (ctx) => {
    try {
        const fullFio = ctx.session.userFio;

        // Принудительно обновляем список смен
        const availableShifts = await getAvailableShifts();
        ctx.session.availableShifts = availableShifts;
        
        console.log('Загружено смен:', availableShifts.length);
        
        if (availableShifts.length === 0) {
            await ctx.editMessageText('📭 *На данный момент нет доступных смен для подработки.*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: 'menu_show_work' }]] }
            });
            return;
        }

        const shiftsKeyboard = availableShifts.map(shift => [
            { 
                text: `📅 ${shift.date} ${shift.time} (${shift.department})`, 
                callback_data: `shift_detail_${shift.id}`
            }
        ]);

        shiftsKeyboard.push([{ text: '↩️ Назад', callback_data: 'menu_show_work' }]);

        await ctx.editMessageText(`📋 *ДОСТУПНЫЕ СМЕНЫ ДЛЯ ПОДРАБОТКИ:*\n\nНайдено ${availableShifts.length} активных смен`, {
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
        const [action, shiftId] = ctx.callbackQuery.data.split('_');
        const { availableShifts, userFio } = ctx.session;

        console.log('Поиск смены ID:', shiftId, 'в массиве из', availableShifts.length, 'смен');
        
        // Логируем все доступные смены для отладки
        availableShifts.forEach((s, i) => {
            console.log(`Смена ${i}: ID=${s.id}, Дата=${s.date}, Статус=${s.status}`);
        });

        // Ищем смену в сохраненном массиве
        const shift = availableShifts.find(s => s.id.toString() === shiftId.toString());
        
        if (!shift) {
            console.log('Смена не найдена! Доступные ID:', availableShifts.map(s => s.id));
            await ctx.answerCbQuery('❌ Смена не найдена');
            return;
        }
        
        console.log('Найдена смена:', shift);
        
        const shiftInfo = `📅 *ДЕТАЛИ СМЕНЫ*\n\n` +
                         `🗓️ *Дата:* ${shift.date}\n` +
                         `⏰ *Время:* ${shift.time}\n` +
                         `🏢 *Отдел:* ${shift.department}\n` +
                         `👥 *Требуется человек:* ${shift.requiredPeople}\n` +
                         `✅ *Подтверждено:* ${shift.approved.length}/${shift.requiredPeople}\n` +
                         `⏳ *Ожидают подтверждения:* ${shift.pendingApproval.length}\n\n`;

        const detailKeyboard = [
            [
                { 
                    text: '📝 Подать заявку', 
                    callback_data: `shift_signup_${shiftId}`
                }
            ],
            [
                { text: '↩️ К списку смен', callback_data: 'work_shifts_list' }
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

bot.action(/^shift_signup_/, async (ctx) => {
    try {
        const [action, shiftId] = ctx.callbackQuery.data.split('_');
        const { userFio, userId } = ctx.session;

        const success = await signUpForShift(ctx.from.id, userFio, shiftId);
        
        if (success) {
            await ctx.answerCbQuery('✅ Заявка подана! Ожидайте подтверждения администратора.');
            
            await ctx.editMessageText('✅ *ЗАЯВКА ПОДАНА!*\n\nОжидайте подтверждения от администратора.', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createBackButton() }
            });
        }
        
    } catch (error) {
        console.error('Ошибка при записи на смену:', error);
        await ctx.answerCbQuery(`❌ ${error.message}`);
    }
});

bot.action('work_my_applications', async (ctx) => {
    try {
        const fullFio = ctx.session.userFio;

        const applications = await getUserApplications(fullFio);

        if (applications.length === 0) {
            await ctx.editMessageText('📭 *У вас нет активных заявок на подработку.*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: 'menu_show_work' }]] }
            });
            return;
        }

        let message = '📋 *МОИ ЗАЯВКИ НА ПОДРАБОТКУ:*\n\n';
        
        applications.forEach((app, index) => {
            const status = app.approved.includes(fullFio) ? '✅ Подтверждена' : 
                          app.pendingApproval.includes(fullFio) ? '⏳ Ожидает подтверждения' : '❓ Неизвестный статус';
            
            message += `${index + 1}. ${app.date} ${app.time} - ${app.department}\n`;
            message += `   👥 ${app.approved.length}/${app.requiredPeople} человек\n`;
            message += `   📝 Статус: ${status}\n\n`;
        });

        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: 'menu_show_work' }]] }
        });
        
    } catch (error) {
        console.error('Ошибка при получении заявок:', error);
        await ctx.answerCbQuery('❌ Ошибка при загрузке заявок');
    }
});

// Обработчик для выбора месяца
bot.action(/^month_/, async (ctx) => {
    try {
        const parts = ctx.callbackQuery.data.split('_');
        if (parts.length < 3) {
            await ctx.answerCbQuery('Ошибка формата');
            return;
        }
        
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        const fullFio = ctx.session.userFio;
        
        if (!fullFio) {
            await ctx.answerCbQuery('ФИО не найдено');
            return;
        }

        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                           'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        
        const monthName = monthNames[month];
        
        if (!monthName) {
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
            [{ text: '📋 Детализировать по дням', callback_data: `detail_${month}_${year}` }],
            [{ text: '↩️ Выбрать другой месяц', callback_data: 'menu_show_productivity' }],
            [{ text: '↩️ Назад в меню', callback_data: 'menu_back_main' }]
        ];

        await safeEditMessage(ctx, message, detailKeyboard);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('❌ Ошибка при выборе месяца:', error);
        await ctx.editMessageText('❌ Не удалось получить данные производительности. Попробуйте позже.', {
            reply_markup: { inline_keyboard: createBackButton() }
        });
        await ctx.answerCbQuery();
    }
});

// Обработчик для детализации
bot.action(/^detail_/, async (ctx) => {
    try {
        const parts = ctx.callbackQuery.data.split('_');
        if (parts.length < 3) {
            await ctx.answerCbQuery('Ошибка формата');
            return;
        }
        
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
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
            [{ text: '↩️ Назад к общей статистике', callback_data: `month_${month}_${year}` }],
            [{ text: '↩️ Назад в меню', callback_data: 'menu_back_main' }]
        ];

        await safeEditMessage(ctx, message, backKeyboard);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('❌ Ошибка при детализации:', error);
        await ctx.editMessageText('❌ Не удалось получить детализированные данные. Попробуйте позже.', {
            reply_markup: { inline_keyboard: createBackButton() }
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
            googleSheetsClient = await connectToGoogleSheets();
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