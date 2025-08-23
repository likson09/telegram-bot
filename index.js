const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const fs = require('fs');
const { session } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ЗАШИТЫЕ ДАННЫЕ
const BOT_TOKEN = '8451305555:AAGIs89Hzl4UKidFRVHeiQaaj2Qs0STtJxI';
const SPREADSHEET_ID = '1s1MZLWFcWZ2mkZJOECJ07KkZ9ETpODvcuQ9xGvVRLoQ';
const GOOGLE_CREDENTIALS_BASE64 = 'ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByb2plY3RfaWQiOiAiZm9yd2FyZC1saWJlcnR5LTQ2OTcwMC1wNyIsCiAgInByaXZhdGVfa2V5X2lkIjogIjMwNTYzY2UyNGM1MjJiOWFmMjI3YzRlYjkzYmY4Y2UyZWU1NzczMDYiLAogICJwcml2YXRlX2tleSI6ICItLS0tLUJFR0lOIFBSSVZBVEUgS0VZLS0tLS1cbk1JSUV2UUlCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQktjd2dnU2pBZ0VBQW9JQkFRRE0zTDQwZEJITzhJL3Vcbk5tWDBnbUtPaHBhZmVGQkRIZjYxUHpjWWQxMWNPK0FrZWVRaFlKM25ZVnJ4ZGtTWVZ3NFp0YUs4dFk3VGVGSWlcbmhidTVqOHNxUzd4VWtHektuQUFONFZENVdCUklYMVFkTGhLZlBIdysyekFzajlUQnFWcDVXcHNiWDQvQ2JJSnNcbmEzUjBTRjBReEtRUjkxbk1meU01elc5VzcwU01aZEx3YitOMWd1OS92QWxBNk5pVnY0UVp2S28rZFpvMnp0OWZcbjlQRUlpNlQxa2tNdDlqMWVnSzYzb3FlMW9IclR5RkNGL0VGTmVPblB5Q29hRFZPTklmVzZOcUpLUDlJaEVBT2Fcbm13R0Q5aUszQUlFWS9UQXhxYXEzM0l3N2kvejNna2syMVhjY2s4NDUzWllSTTBvdzc2bWh2NGZkdk5GVGhHb0FcbmdhTzRFT1R2QWdNQkFBRUNnZ0VBQmlsWUprZEhhcnBrTHlneEJpa3JGM1pPbVcvdVJMb1E0L3hzK0s0VHVGSUJcbkpTWHVRcGdSVW1kV1R4M0ExdGwxcXFvUXdaN24zaU45TGM5TVZheHRDdnllMFhVdmRBYktkRXNWck5UYXJtMDZcblBLU3BOa2NTL25aUGJ0WG1aRUJLWU1YSWFyVjFoc1d4S0UweFNUNE0waFBYL1RldGhSTkJaVTNpc2c2cnh1ZlpcbmlldHdZMkUxMmgxRXcvejlGb2xzbEd1UjhNRS9jbFBBa2xLOEgwbzc0M0RURUQ0SHR3UjdSa1VTZ2tna0VQU1ZcbmVNNmRJWE1OZGc5ODNrOXlXT1VkS25Tb1lKczFKNEVQcm5XSzNHV1hSL09NL1d2UmtRVUJneVBwV3ZqaXBLNXNcbkVaQTVCNjBmckpGd0pSWllnc3lZVW9KejUvd3RSQ3VqQzRkc2VFUjlvUUtCZ1FEdWlwaEdrdXJVd2RucmFTY0tcbmdtbE1oQndBcTB4dmxSWEJ6bktrcnorRWVTb0FZUVZOV0hYbFRpVDN0QXY5VjZLMG8vZTJ1ZmN5c1E0bjV5TmVcblVsUVhJQktzdmpBQUpYS1hkcjNlUGlZQ3ZycWUxRUoycElXdFdSSzJlaDYrWFRPOW9JbGRXbUNHMTZZRlpBeXdcbmZRejc3emlRa29Uby9sNkhUeVBFbkdNTUxRS0JnUURiMngrR0xpMG9WaWVIZkRaRDFXdWhxNHJ3MGZQNlVMb1JcbkQ4ZmgvZGpuV3ByS0ZGRklRc3h2N2xMUVcyWVFsOU83UnNwV0NsVjMwNjNwRmo0WEFzU0tHQ1NoVnJqa1kvcDJcbk1Ec041UFFSK1VwaElkRlBkckxlN25MSVZmSGF4UjAxM3U2b096SW1xb081WTZLTjVOMGl3b0NYWTNOODdHRW5cbk05aDVmNlU3Q3dLQmdCZXVOcE82L2drRS9ZYzdOeDc1OTA0YlIxUmhyUUxldi93dmJINGd6Nk50QzloaHlVNzJcbld5M2FaaDBaQ0orcjFZRXRUZWdiNmdoa1AwMkN5cVlRY2p5aGVIa2hvRTVEYVc3VDRPRnhOZ0RMd21jR0Yxc0RcbjFpbHhVRVJCTjFBYW5JcFVwNDVXN0lJMllrcml0Y2ZIZ2tSNGFSc2hFSVM0eTlXTzY3UVcrbFk1QW9HQkFMdklcbkpOek9nL04zNHJ0dDlFdHI5a3BYNG94ZVJ5ejkxbTdNTThWcXMrQ25HcDZQUy8yVVVGa3FEY0c0enl4TkFhTnJcbmkxYUI3UTR6MXM3SEdMRSt3Ky9QUHpvdWdDMVMxNUlyRDhXR1VKRXBnOFlDeEd4Q3pmUnJaYzZHMmRRcG1CRnpcbklCVEF1czBieHZhSmkwWDJ2SW43NXlsbTREVkxFSkFUVUVvMkpFS1JBb0dBWExNdGRxZnlEUmlObVc2cE1ydGFcbkdGZjhmRGZGUUpITnZIMU12bW9HUVZ4VFE0amd6NFU1TnJyN1M4NmpsNTFkQnozU1A5TUhoYS9SWE83WVpYRTZcbnBxN0JzTUN3QXJIc2ZTeDNiTXBYNm1WVnpUaURzemdLQ0lBMTVvYjMreFA5VmcvMjlGdXo3OTh5T2h5V29zOEdcblRKcDlVTTFpd2pGbEZKSHRuNjBmNEk4PVxuLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLVxuIiwKICAiY2xpZW50X2VtYWlsIjogImJlbGtpbkBmb3J3YXJkLWxpYmVydHktNDY5NzAwLXA3LmlhbS5nc2VydmljZWFjY291bnQuY29tIiwKICAiY2xpZW50X2lkIjogIjEwNzIzNzcwMDI4OTY1NjczMDU3MSIsCiAgImF1dGhfdXJpIjogImh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwKICAidG9rZW5fdXJpIjogImh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwKICAiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL29hdXRoMi92MS9jZXJ0cyIsCiAgImNsaWVudF94NTA5X2NlcnRfdXJsIjogImh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvYmVsa2luJTQwZm9yd2FyZC1saWJlcnR5LTQ2OTcwMC1wNy5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSIsCiAgInVuaXZlcnNlX2RvbWFpbiI6ICJnb29nbGVhcGlzLmNvbSIKfQ==';

// Функция для исправления формата приватного ключа
function fixPrivateKey(privateKey) {
    // Убираем лишние пробелы и символы переноса строк
    return privateKey
        .replace(/\\n/g, '\n')
        .replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
        .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----')
        .replace(/\s+/g, '\n');
}

// Подключение к Google Sheets через Service Account
async function safeConnectToSheet() {
    try {
        console.log('Подключение к Google Sheets через Service Account...');

        if (!GOOGLE_CREDENTIALS_BASE64) {
            throw new Error('Google credentials не настроены');
        }

        // Декодируем credentials из base64
        const credentialsJson = Buffer.from(GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8');
        const credentials = JSON.parse(credentialsJson);

        // Исправляем формат приватного ключа
        credentials.private_key = fixPrivateKey(credentials.private_key);

        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
        });
        
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        console.log('Подключение через Service Account успешно');
        return sheets;
        
    } catch (error) {
        console.error('Ошибка при подключении к Google Sheets:', error.message);
        console.error('Детали ошибки:', error);
        throw new Error('Не удалось подключиться к Google Sheets');
    }
}

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
                    await ctx.reply('Не удалось получить данные об ошибках. Попробуйте позже.');
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
                    const totalWorked = shiftData.plannedShifts + shiftData.extraShifts;
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
                    await ctx.reply('Не удалось получить данные табеля. Попробуйте позже.');
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

        message += `📦 *ОТБОР ТОВАРА*\n`;
        message += `├ ОС: ${totalOsSelection} ед.\n`;
        message += `└ РМ: ${totalRmSelection} ед.\n\n`;

        message += `📋 *РАЗМЕЩЕНИЕ ТОВАРА*\n`;
        message += `├ ОС: ${totalOsPlacement} ед.\n`;
        message += `└ РМ: ${totalRmPlacement} ед.\n\n`;

        message += `📈 *ОБЩАЯ СТАТИСТIKA*\n`;
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
        await ctx.reply('Не удалось получить данные за месяц. Попробуйте позже.');
        await ctx.answerCbQuery();
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
            [{ text: '↩️ Назад к общей статистике', callback_data: `month_${month-1}_${year}_${ctx.match[3]}` }],
            [{ text: '↩️ Назад в меню', callback_data: `back_${ctx.match[3]}_${userId}` }]
        ];

        await safeEditMessage(ctx, message, backKeyboard);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('Ошибка при детализации:', error);
        await ctx.reply('Не удалось получить детализированные данные. Попробуйте позже.');
        await ctx.answerCbQuery();
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
            return 0;
        }

        const errors = rows.filter(row => row[0] === fio);
        return errors.length;
    } catch (error) {
        console.error('Ошибка при получении количества ошибок:', error.message);
        throw error;
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

async function getShiftData(fio) {
    try {
        const sheets = await safeConnectToSheet();
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Табель!A:Z'
        });

        const rows = result.data.values;
        if (!rows || rows.length < 2) {
            throw new Error('Данные табеля не найдены');
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
        
        throw new Error('Сотрудник не найден в табеле');
        
    } catch (error) {
        console.error('Ошибка при получении данных табеля:', error.message);
        throw error;
    }
}

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

// Глобальная обработка ошибок
bot.catch(async (error, ctx) => {
    console.error('Произошла ошибка в боте:', error);
    try {
        await ctx.reply('Произошла непредвиденная ошибка. Попробуйте позже.');
    } catch (err) {
        console.error('Не удалось отправить сообщение об ошибке:', err);
    }
});

// Запуск бота
async function startBot() {
    try {
        console.log('Запуск бота...');

        // На Render используем webhook
        if (process.env.RENDER) {
            console.log('Запуск в режиме webhook (Render)');
            
            // Устанавливаем webhook endpoint
            app.use(bot.webhookCallback('/telegram-webhook'));
            
            // Запускаем сервер
            app.listen(PORT, () => {
                console.log(`Server listening on port ${PORT}`);
            });
            
            // Устанавливаем webhook
            const domain = process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
            await bot.telegram.setWebhook(`${domain}/telegram-webhook`);
            
            console.log('Webhook установлен успешно');
        } else {
            console.log('Запуск в режиме polling');
            await bot.launch({
                dropPendingUpdates: true,
                allowedUpdates: ['message', 'callback_query'],
                polling: {
                    timeout: 10,
                    limit: 100,
                    allowedUpdates: ['message', 'callback_query']
                }
            });
        }
        
        console.log('Telegram бот запущен успешно!');
        
    } catch (error) {
        console.error('Ошибка при запуске бота:', error.message);
        console.error('Детали ошибки:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('Остановка бота...');
    bot.stop();
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('Остановка бота...');
    bot.stop();
    process.exit(0);
});

// Запускаем бота
startBot();

console.log('Application started successfully');