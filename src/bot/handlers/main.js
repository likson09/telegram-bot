const UserService = require('../services/user-service');
const { validateFIO } = require('../../utils/validators');
const { truncateName } = require('../../utils/formatters');

function setupMainHandlers(bot) {
    let userService = null;

    // Инициализация сервиса при первом использовании
    async function getUserService() {
        if (!userService) {
            userService = new UserService();
            await userService.connect();
        }
        return userService;
    }

    // Команда /start
    bot.start(async (ctx) => {
        try {
            console.log('Получена команда /start от пользователя:', ctx.from.id);
            
            const service = await getUserService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            const welcomeMessage = `👋 *Добро пожаловать в бот статистики!*\n\n` +
                                  `📈 Здесь вы можете получить информацию о:\n` +
                                  `• 📊 Количестве ошибок\n` +
                                  `• 📅 Данных табеля\n` +
                                  `• 🚀 Производительности труда\n` +
                                  `• 💼 Подработках и дополнительных сменах\n\n` +
                                  `${isAdmin ? '⚡ *Вы администратор системы*' : ''}\n\n` +
                                  `📝 *Отправьте ваше ФИО* (Фамилия Имя Отчество) для начала работы.`;
            
            await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Ошибка при ответе на /start:', error);
            await ctx.reply('❌ Произошла ошибка при запуске бота. Попробуйте позже.');
        }
    });

    // Команда /help
    bot.command('help', async (ctx) => {
        const helpMessage = `📖 *ПОМОЩЬ ПО БОТУ*\n\n` +
                           `*Основные команды:*\n` +
                           `/start - Начать работу с ботом\n` +
                           `/help - Показать эту справку\n` +
                           `/pod - Быстрая запись на подработку\n\n` +
                           `*Для администраторов:*\n` +
                           `/admin - Панель администратора\n` +
                           `/podrabotka - Создать новую смену\n\n` +
                           `*Как работать:*\n` +
                           `1. Отправьте ваше ФИО\n` +
                           `2. Выберите нужный раздел в меню\n` +
                           `3. Получайте актуальную информацию`;
        
        await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    });

    // Команда /info
    bot.command('info', async (ctx) => {
        const infoMessage = `ℹ️ *ИНФОРМАЦИЯ О БОТЕ*\n\n` +
                           `*Версия:* 1.0.0\n` +
                           `*Назначение:* Система учета статистики и подработок\n` +
                           `*Функции:*\n` +
                           `• Просмотр ошибок и табеля\n` +
                           `• Анализ производительности\n` +
                           `• Запись на дополнительные смены\n` +
                           `• Управление для администраторов\n\n` +
                           `*Техподдержка:* Обращайтесь к вашему руководителю`;
        
        await ctx.reply(infoMessage, { parse_mode: 'Markdown' });
    });

    // Главное меню
    bot.action('menu_back_main', async (ctx) => {
        try {
            const service = await getUserService();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.editMessageText('📝 *Отправьте ваше ФИО заново:*\n(Фамилия Имя Отчество)', { 
                    parse_mode: 'Markdown' 
                });
                return;
            }

            const isAdmin = await service.isAdmin(ctx.from.id);
            const menuMessage = `👤 *${fullFio}*\n\n` +
                               `📊 *Выберите раздел для просмотра статистики:*`;

            await ctx.editMessageText(menuMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createMainMenu(isAdmin) }
            });
        } catch (error) {
            console.error('Ошибка при возврате в главное меню:', error);
            await ctx.editMessageText('❌ Ошибка при загрузке меню', {
                reply_markup: { inline_keyboard: createBackButton() }
            });
        }
    });

    // Смена ФИО
    bot.action('menu_change_fio', async (ctx) => {
        try {
            // Сбрасываем adminAction чтобы избежать конфликта
            ctx.session.adminAction = null;
            ctx.session.userFio = null;
            
            await ctx.editMessageText('📝 *СМЕНА ФИО*\n\nОтправьте ваше ФИО заново:\n(Фамилия Имя Отчество)', { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Отмена', callback_data: 'menu_back_main' }]
                    ]
                }
            });
            await ctx.answerCbQuery();
        } catch (error) {
            console.error('Ошибка при смене ФИО:', error);
            await ctx.answerCbQuery('⚠️ Ошибка при смене ФИО');
        }
    });

    // Обработка текстовых сообщений (ФИО)
    bot.on('text', async (ctx) => {
        if (ctx.message.text.startsWith('/')) return;

        // Если это админское действие, пропускаем обычную обработку
        if (ctx.session.adminAction && (ctx.session.adminAction === 'add' || ctx.session.adminAction === 'remove')) {
            return;
        }

        // Если идет создание смены, пропускаем обработку ФИО
        if (ctx.session.creatingShift) {
            return;
        }

        const fio = ctx.message.text.trim();
        console.log('Получено ФИО:', fio);
        
        try {
            const service = await getUserService();

            if (!validateFIO(fio)) {
                const errorMessage = `❌ *Некорректный формат ФИО*\n\n` +
                                   `📋 Правильный формат: *Фамилия Имя Отчество*\n` +
                                   `Пример: *Иванов Иван Иванович*\n\n` +
                                   `Пожалуйста, отправьте ФИО в правильном формате.`;
                
                await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
                return;
            }
            
            // Проверяем существование сотрудника
            const employeeExists = await service.checkEmployeeExists(fio);
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
            
            // Сохраняем в сессии
            ctx.session.userFio = fio;
            const [lastName, firstName, patronymic] = fio.split(' ');
            ctx.session.shortFio = `${lastName.slice(0, 3)}${firstName.slice(0, 3)}${patronymic.slice(0, 3)}`;
            ctx.session.userId = ctx.from.id;
            
            // Сохраняем пользователя в базе
            await service.saveUser(fio, ctx.from.id);
            
            const isAdmin = await service.isAdmin(ctx.from.id);
            const menuMessage = `👤 *${fio}*\n\n` +
                               `📊 *Выберите раздел для просмотра статистики:*\n\n` +
                               `▫️ *📊 Ошибки* - количество рабочих ошибок\n` +
                               `▫️ *📅 Табель* - информация о сменах\n` +
                               `▫️ *🚀 Производительность* - показатели эффективности\n` +
                               `▫️ *💼 Подработки* - запись на дополнительные смены\n\n` +
                               `${isAdmin ? '⚡ *Режим администратора активирован*' : ''}`;
            
            await ctx.reply(menuMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: createMainMenu(isAdmin) }
            });
            
        } catch (error) {
            console.error('Ошибка при обработке ФИО:', error);
            const errorMessage = `⚠️ *Произошла ошибка*\n\n` +
                               `При обработке вашего запроса возникла проблема.\n\n` +
                               `Пожалуйста, попробуйте позже или обратитесь к администратору.`;
            
            await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
        }
    });

    // Обработчики основных меню
    bot.action('menu_show_errors', async (ctx) => {
        try {
            const service = await getUserService();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено. Отправьте ФИО снова.');
                return;
            }

            const errorCount = await service.getErrorCount(fullFio);
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
    });

    bot.action('menu_show_timesheet', async (ctx) => {
        try {
            const service = await getUserService();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено. Отправьте ФИО снова.');
                return;
            }

            const shiftData = await service.getShiftData(fullFio);
            const totalWorked = shiftData.plannedShifts + shiftData.extraShifts + shiftData.reinforcementShifts;
            const attendanceRate = shiftData.plannedShifts > 0 
                ? Math.round((totalWorked / shiftData.plannedShifts) * 100)
                : 0;

            const message = `📊 *ТАБЕЛЬ СОТРУДНИКА*\n\n` +
                          `👤 *ФИО:* ${fullFio}\n\n` +
                          `📅 *График:* ${shiftData.plannedShifts} смен\n` +
                          `➕ *Доп. смены:* ${shiftData.extraShifts}\n` +
                          `❌ *Прогулы:* ${shiftData.absences}\n` +
                          `💪 *Усиления:* ${shiftData.reinforcementShifts}\n\n` +
                          `✅ *Всего отработано:* ${totalWorked} смен\n` +
                          `📈 *Посещаемость:* ${attendanceRate}%`;

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
    });

    // Обработка неизвестных команд
    bot.on('message', async (ctx) => {
        if (ctx.message.text && ctx.message.text.startsWith('/')) {
            await ctx.reply('❌ Неизвестная команда. Используйте /help для списка команд.');
        }
    });

    // Создание главного меню
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
                    text: '💼 Подработка', 
                    callback_data: 'menu_show_work'
                }
            ]
        ];

        if (isAdmin) {
            menu.push([
                { 
                    text: '👑 Админ', 
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

    // Вспомогательная функция для кнопки "Назад"
    function createBackButton(backTo = 'menu_back_main') {
        return [
            [{ text: '↩️ Назад', callback_data: backTo }]
        ];
    }
}

module.exports = { setupMainHandlers };