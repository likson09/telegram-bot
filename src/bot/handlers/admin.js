const AdminService = require('../services/admin-service');
const { formatDateShort, truncateName } = require('../../utils/formatters');

function setupAdminHandlers(bot) {
    let adminService = null;

    // Инициализация сервиса при первом использовании
    async function getAdminService() {
        if (!adminService) {
            adminService = new AdminService();
            await adminService.connect();
        }
        return adminService;
    }

    // Команда /admin
    bot.command('admin', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
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

    // Админская панель
    bot.action('menu_admin_panel', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const adminMenu = [
                [
                    { text: '📋 Заявки', callback_data: 'admin_applications' },
                    { text: '📅 Смены', callback_data: 'admin_shifts' }
                ],
                [
                    { text: '👥 Админы', callback_data: 'admin_manage' },
                    { text: '📊 Стат-ка', callback_data: 'admin_stats' }
                ],
                [
                    { text: '↩️ Назад', callback_data: 'menu_back_main' }
                ]
            ];

            await ctx.editMessageText('👑 *АДМИН ПАНЕЛЬ*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: adminMenu }
            });
        } catch (error) {
            console.error('Ошибка при открытии админ-панели:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    });

    // Меню управления заявками
    bot.action('admin_applications', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const applications = await service.getPendingApplications();
            
            if (applications.length === 0) {
                await ctx.editMessageText('📭 *Нет заявок на подработку для рассмотрения*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: createBackButton('menu_admin_panel') }
                });
                return;
            }

            // Сохраняем заявки в сессии
            ctx.session.pendingApplications = applications;

            const applicationsKeyboard = applications.map((app, index) => [
                { 
                    text: `📝 ${truncateName(app.userName)} - ${formatDateShort(app.date)}`, 
                    callback_data: `admin_app_detail_${index}`
                }
            ]);

            applicationsKeyboard.push([{ text: '↩️ Назад', callback_data: 'menu_admin_panel' }]);

            await ctx.editMessageText(`📋 *ЗАЯВКИ НА ПОДРАБОТКУ*\n\nНайдено ${applications.length} заявок на рассмотрение:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: applicationsKeyboard }
            });

        } catch (error) {
            console.error('Ошибка при получении заявок:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке заявок');
        }
    });

    // Детали заявки
    bot.action(/^admin_app_detail_/, async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
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

    // Подтверждение заявки
    bot.action(/^admin_app_approve_/, async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const index = parseInt(ctx.callbackQuery.data.split('_')[3]);
            const application = ctx.session.pendingApplications[index];
            
            if (!application) {
                await ctx.answerCbQuery('❌ Заявка не найдена');
                return;
            }

            const result = await service.approveApplication(
                application.shiftId, 
                application.userString,
                ctx.from.id
            );

            if (result.success) {
                await ctx.answerCbQuery('✅ Заявка подтверждена!');
                
                // Обновляем список заявок
                ctx.session.pendingApplications = await service.getPendingApplications();
                
                const message = `✅ *ЗАЯВКА ПОДТВЕРЖДЕНА!*\n\n` +
                               `👤 Сотрудник: ${application.userName}\n` +
                               `📅 Смена: ${application.date} ${application.time}\n` +
                               `🏢 Отдел: ${application.department}\n\n` +
                               `✅ Подтверждено: ${result.shift.approved.length}/${result.shift.requiredPeople}`;

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: createBackButton('admin_applications') }
                });
            }

        } catch (error) {
            console.error('Ошибка при подтверждении заявки:', error);
            await ctx.answerCbQuery('❌ Ошибка при подтверждении');
        }
    });

    // Отклонение заявки
    bot.action(/^admin_app_reject_/, async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const index = parseInt(ctx.callbackQuery.data.split('_')[3]);
            const application = ctx.session.pendingApplications[index];
            
            if (!application) {
                await ctx.answerCbQuery('❌ Заявка не найдена');
                return;
            }

            const result = await service.rejectApplication(
                application.shiftId, 
                application.userString,
                ctx.from.id
            );

            if (result.success) {
                await ctx.answerCbQuery('❌ Заявка отклонена!');
                
                // Обновляем список заявок
                ctx.session.pendingApplications = await service.getPendingApplications();
                
                const message = `❌ *ЗАЯВКА ОТКЛОНЕНА!*\n\n` +
                               `👤 Сотрудник: ${application.userName}\n` +
                               `📅 Смена: ${application.date} ${application.time}\n` +
                               `🏢 Отдел: ${application.department}`;

                await ctx.editMessageText(message, {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: createBackButton('admin_applications') }
                });
            }

        } catch (error) {
            console.error('Ошибка при отклонении заявки:', error);
            await ctx.answerCbQuery('❌ Ошибка при отклонении');
        }
    });

    // Меню управления сменами
    bot.action('admin_shifts', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const shiftsMenu = [
                [
                    { text: '📋 Все смены', callback_data: 'admin_all_shifts' },
                    { text: '✅ Активные', callback_data: 'admin_active_shifts' }
                ],
                [
                    { text: '➕ Создать смену', callback_data: 'admin_create_shift' }
                ],
                [
                    { text: '📊 Статистика смен', callback_data: 'admin_shifts_stats' }
                ],
                [
                    { text: '↩️ Назад', callback_data: 'menu_admin_panel' }
                ]
            ];

            await ctx.editMessageText('📅 *УПРАВЛЕНИЕ СМЕНАМИ*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: shiftsMenu }
            });

        } catch (error) {
            console.error('Ошибка при открытии управления сменами:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    });

    // Все смены
    bot.action('admin_all_shifts', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const allShifts = await service.getAllShifts();
            
            if (allShifts.length === 0) {
                await ctx.editMessageText('📭 *Нет созданных смен*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: createBackButton('admin_shifts') }
                });
                return;
            }

            const shiftsKeyboard = allShifts.map(shift => [
                { 
                    text: `📅 ${formatDateShort(shift.date)} ${shift.status}`, 
                    callback_data: `admin_shift_detail_${shift.id}`
                }
            ]);

            shiftsKeyboard.push([{ text: '↩️ Назад', callback_data: 'admin_shifts' }]);

            await ctx.editMessageText(`📋 *ВСЕ СМЕНЫ*\n\nНайдено ${allShifts.length} смен:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: shiftsKeyboard }
            });

        } catch (error) {
            console.error('Ошибка при получении всех смен:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке смен');
        }
    });

    // Активные смены
    bot.action('admin_active_shifts', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const activeShifts = await service.getActiveShifts();
            
            if (activeShifts.length === 0) {
                await ctx.editMessageText('📭 *Нет активных смен*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: createBackButton('admin_shifts') }
                });
                return;
            }

            const shiftsKeyboard = activeShifts.map(shift => [
                { 
                    text: `📅 ${formatDateShort(shift.date)} ${shift.time}`, 
                    callback_data: `admin_shift_detail_${shift.id}`
                }
            ]);

            shiftsKeyboard.push([{ text: '↩️ Назад', callback_data: 'admin_shifts' }]);

            await ctx.editMessageText(`✅ *АКТИВНЫЕ СМЕНЫ*\n\nНайдено ${activeShifts.length} активных смен:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: shiftsKeyboard }
            });

        } catch (error) {
            console.error('Ошибка при получении активных смен:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке смен');
        }
    });

    // Создание смены
    bot.action('admin_create_shift', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            ctx.session.creatingShift = true;
            ctx.session.shiftData = {};
            
            await ctx.editMessageText('📝 *СОЗДАНИЕ НОВОЙ СМЕНЫ*\n\nВведите данные в формате:\n\n' +
                                   '📅 *Дата:* ДД.ММ.ГГГГ\n' +
                                   '⏰ *Время:* ЧЧ:ММ-ЧЧ:ММ\n' + 
                                   '🏢 *Отдел:* Название отдела\n' +
                                   '👥 *Количество человек:* число\n\n' +
                                   'Пример:\n15.01.2024\n14:00-22:00\nСклад\n3', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '❌ Отменить', callback_data: 'admin_shifts' }
                    ]]
                }
            });

        } catch (error) {
            console.error('Ошибка при создании смены:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    });

    // Статистика смен
    bot.action('admin_shifts_stats', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const stats = await service.getShiftsStats();
            
            if (!stats) {
                await ctx.answerCbQuery('❌ Ошибка загрузки статистики');
                return;
            }

            const statsMessage = `📊 *СТАТИСТИКА СМЕН*\n\n` +
                               `📅 *Всего смен:* ${stats.total}\n` +
                               `✅ *Активных:* ${stats.active}\n` +
                               `🏁 *Завершенных:* ${stats.completed}\n` +
                               `⚫ *Неактивных:* ${stats.inactive}\n\n` +
                               `📝 *Заявки:*\n` +
                               `├ Всего: ${stats.totalApplications}\n` +
                               `├ Ожидают: ${stats.pendingApplications}\n` +
                               `└ Подтверждено: ${stats.approvedApplications}\n\n` +
                               `📈 *Заполненность:* ${stats.averageFulfillment}%`;

            const statsMenu = [
                [
                    { text: '🔄 Обновить', callback_data: 'admin_shifts_stats' }
                ],
                [
                    { text: '↩️ Назад', callback_data: 'admin_shifts' }
                ]
            ];

            await ctx.editMessageText(statsMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: statsMenu }
            });

        } catch (error) {
            console.error('Ошибка при загрузке статистики смен:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке статистики');
        }
    });

    // Меню управления админами
    bot.action('admin_manage', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const manageMenu = [
                [
                    { text: '👥 Список админов', callback_data: 'admin_list' },
                    { text: '➕ Добавить админа', callback_data: 'admin_add' }
                ],
                [
                    { text: '➖ Удалить админа', callback_data: 'admin_remove' }
                ],
                [
                    { text: '↩️ Назад', callback_data: 'menu_admin_panel' }
                ]
            ];

            await ctx.editMessageText('👥 *УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: manageMenu }
            });

        } catch (error) {
            console.error('Ошибка при открытии управления админами:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    });

    // Список админов
    bot.action('admin_list', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const admins = await service.getAdmins();
            
            let adminList = '👥 *СПИСОК АДМИНИСТРАТОРОВ:*\n\n';
            adminList += `🛡️ Супер-админ: ${service.SUPER_ADMIN_ID}\n\n`;
            
            if (admins.length > 0) {
                admins.forEach((adminId, index) => {
                    if (adminId !== service.SUPER_ADMIN_ID) {
                        adminList += `${index + 1}. ${adminId}\n`;
                    }
                });
            } else {
                adminList += '📭 Других администраторов нет';
            }

            await ctx.editMessageText(adminList, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '↩️ Назад', callback_data: 'admin_manage' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при получении списка админов:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке списка');
        }
    });

    // Добавление админа
    bot.action('admin_add', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            ctx.session.adminAction = 'add';
            await ctx.editMessageText('👥 *ДОБАВЛЕНИЕ АДМИНИСТРАТОРА*\n\nОтправьте ID пользователя:', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Отмена', callback_data: 'admin_manage' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при добавлении админа:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    });

    // Удаление админа
    bot.action('admin_remove', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Нет прав!');
                return;
            }

            const admins = await service.getAdmins();
            const regularAdmins = admins.filter(id => id !== service.SUPER_ADMIN_ID);
            
            if (regularAdmins.length === 0) {
                await ctx.answerCbQuery('❌ Нет администраторов для удаления');
                return;
            }

            ctx.session.adminAction = 'remove';
            await ctx.editMessageText('👥 *УДАЛЕНИЕ АДМИНИСТРАТОРА*\n\nОтправьте ID пользователя:', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Отмена', callback_data: 'admin_manage' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при удалении админа:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    });

    // Статистика системы
    bot.action('admin_stats', async (ctx) => {
        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const stats = await service.getAdminStats();
            
            if (!stats) {
                await ctx.answerCbQuery('❌ Ошибка загрузки статистики');
                return;
            }

            const statsMessage = `📊 *СТАТИСТИКА СИСТЕМЫ*\n\n` +
                               `📅 *Смены:*\n` +
                               `├ Всего: ${stats.totalShifts}\n` +
                               `├ Активных: ${stats.activeShifts}\n` +
                               `└ Завершенных: ${stats.completedShifts}\n\n` +
                               `📝 *Заявки:*\n` +
                               `├ Всего: ${stats.totalApplications}\n` +
                               `├ Ожидают: ${stats.pendingApplications}\n` +
                               `└ Подтверждено: ${stats.approvedApplications}\n\n` +
                               `📈 *Заполненность:* ${stats.fulfillmentRate}%`;

            const statsMenu = [
                [
                    { text: '🔄 Обновить статистику', callback_data: 'admin_stats' }
                ],
                [
                    { text: '↩️ Назад в админ-панель', callback_data: 'menu_admin_panel' }
                ]
            ];

            await ctx.editMessageText(statsMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: statsMenu }
            });

        } catch (error) {
            console.error('Ошибка при загрузке статистики:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке статистики');
        }
    });

    // Обработка текстовых сообщений для админских действий
    bot.on('text', async (ctx) => {
        if (ctx.message.text.startsWith('/')) return;
        if (!ctx.session.adminAction) return;

        try {
            const service = await getAdminService();
            const isAdmin = await service.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                ctx.session.adminAction = null;
                return;
            }

            const userId = parseInt(ctx.message.text);
            
            if (isNaN(userId)) {
                await ctx.reply('❌ Неверный формат ID. Введите числовой ID пользователя.');
                return;
            }

            if (ctx.session.adminAction === 'add') {
                await service.addAdmin(userId);
                await ctx.reply(`✅ Пользователь ${userId} добавлен в администраторы.`);
            } else if (ctx.session.adminAction === 'remove') {
                await service.removeAdmin(userId);
                await ctx.reply(`✅ Пользователь ${userId} удален из администраторов.`);
            }

            ctx.session.adminAction = null;
            
            // Возвращаем в меню управления админами
            const manageMenu = [
                [
                    { text: '👥 Список админов', callback_data: 'admin_list' },
                    { text: '➕ Добавить админа', callback_data: 'admin_add' }
                ],
                [
                    { text: '➖ Удалить админа', callback_data: 'admin_remove' }
                ],
                [
                    { text: '↩️ Назад в админ-панель', callback_data: 'menu_admin_panel' }
                ]
            ];

            await ctx.reply('👥 *УПРАВЛЕНИЕ АДМИНИСТРАТОРАМИ*', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: manageMenu }
            });
            
        } catch (error) {
            await ctx.reply(`❌ Ошибка: ${error.message}`);
            ctx.session.adminAction = null;
        }
    });

    // Вспомогательная функция для кнопки "Назад"
    function createBackButton(backTo = 'menu_admin_panel') {
        return [
            [{ text: '↩️ Назад', callback_data: backTo }]
        ];
    }
}

module.exports = { setupAdminHandlers };