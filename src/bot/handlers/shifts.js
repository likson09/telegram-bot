const ShiftService = require('../services/shift-service');
const AdminService = require('../services/admin-service');
const { formatDateShort, truncateName } = require('../../utils/formatters');

function setupShiftHandlers(bot) {
    let shiftService = null;
    let adminService = null;

    // Инициализация сервисов
    async function getServices() {
        if (!shiftService) {
            shiftService = new ShiftService();
            await shiftService.connect();
        }
        if (!adminService) {
            adminService = new AdminService();
            await adminService.connect();
        }
        return { shiftService, adminService };
    }

    // Команда /podrabotka для создания смен
    bot.command('podrabotka', async (ctx) => {
        try {
            const { adminService } = await getServices();
            const userId = ctx.from.id;
            const isUserAdmin = await adminService.isAdmin(userId);
            
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

    // Обработка текстовых сообщений для создания смены
    bot.on('text', async (ctx) => {
        if (ctx.message.text.startsWith('/')) return;
        if (!ctx.session.creatingShift) return;

        try {
            const { shiftService, adminService } = await getServices();
            const isUserAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isUserAdmin) {
                ctx.session.creatingShift = false;
                ctx.session.shiftData = {};
                await ctx.reply('❌ Недостаточно прав!');
                return;
            }

            const text = ctx.message.text.trim();
            
            if (!ctx.session.shiftData.date) {
                // Ввод даты
                if (!/^\d{2}\.\d{2}\.\d{4}$/.test(text)) {
                    await ctx.reply('❌ Неверный формат даты. Используйте ДД.ММ.ГГГГ\nПример: 15.01.2024');
                    return;
                }
                ctx.session.shiftData.date = text;
                await ctx.reply('✅ Дата сохранена.\n⏰ Теперь введите время смены (формат: ЧЧ:ММ-ЧЧ:ММ)\nПример: 14:00-22:00');
                return;
            }
            
            if (!ctx.session.shiftData.time) {
                // Ввод времени
                if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(text)) {
                    await ctx.reply('❌ Неверный формат времени. Используйте ЧЧ:ММ-ЧЧ:ММ\nПример: 14:00-22:00');
                    return;
                }
                ctx.session.shiftData.time = text;
                await ctx.reply('✅ Время сохранено.\n🏢 Теперь введите отдел или место работы\nПример: Склад или Торговый зал');
                return;
            }
            
            if (!ctx.session.shiftData.department) {
                // Ввод отдела
                ctx.session.shiftData.department = text;
                await ctx.reply('✅ Отдел сохранен.\n👥 Теперь введите количество требуемых человек (только цифру)\nПример: 3');
                return;
            }
            
            if (!ctx.session.shiftData.requiredPeople) {
                // Ввод количества людей
                const peopleCount = parseInt(text);
                if (isNaN(peopleCount) || peopleCount <= 0) {
                    await ctx.reply('❌ Неверное количество. Введите число больше 0\nПример: 3');
                    return;
                }
                ctx.session.shiftData.requiredPeople = peopleCount;
                
                // Валидация данных
                const validationErrors = shiftService.validateShiftData(ctx.session.shiftData);
                if (validationErrors.length > 0) {
                    await ctx.reply(`❌ Ошибки валидации:\n${validationErrors.join('\n')}`);
                    return;
                }
                
                // Сохраняем данные перед сбросом сессии
                const shiftData = { ...ctx.session.shiftData };
                
                // Создаем смену
                const shiftId = await shiftService.createShift(shiftData);
                
                // Сбрасываем сессию
                ctx.session.creatingShift = false;
                ctx.session.shiftData = {};
                
                await ctx.reply(
                    '✅ *СМЕНА УСПЕШНО СОЗДАНА!*\n\n' +
                    `🆔 ID смены: ${shiftId}\n` +
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
    });

    // Детали смены для администратора
    bot.action(/^admin_shift_detail_/, async (ctx) => {
        try {
            const { shiftService, adminService } = await getServices();
            const isAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const callbackData = ctx.callbackQuery.data;
            const shiftId = callbackData.replace('admin_shift_detail_', '');
            
            const shiftDetails = await shiftService.getShiftDetails(shiftId);
            
            const message = `📋 *ДЕТАЛИ СМЕНЫ #${shiftId}*\n\n` +
                           `📅 *Дата:* ${shiftDetails.date}\n` +
                           `⏰ *Время:* ${shiftDetails.time}\n` +
                           `🏢 *Отдел:* ${shiftDetails.department}\n` +
                           `👥 *Требуется:* ${shiftDetails.requiredPeople} чел.\n` +
                           `✅ *Подтверждено:* ${shiftDetails.approved.length}/${shiftDetails.requiredPeople}\n` +
                           `⏳ *Ожидают:* ${shiftDetails.pendingApproval.length}\n` +
                           `📝 *Записались:* ${shiftDetails.signedUp.length}\n\n` +
                           `📊 *Статус:* ${shiftDetails.status}\n` +
                           `🎯 *Заполненность:* ${shiftDetails.fulfillmentPercentage}%\n` +
                           `📦 *Свободные места:* ${shiftDetails.availableSlots}`;

            const actionKeyboard = [
                [
                    { text: '✅ Завершить смену', callback_data: `admin_complete_shift_${shiftId}` },
                    { text: '⚫ Деактивировать', callback_data: `admin_deactivate_shift_${shiftId}` }
                ],
                [
                    { text: '✏️ Редактировать', callback_data: `admin_edit_shift_${shiftId}` }
                ],
                [
                    { text: '↩️ К списку смен', callback_data: 'admin_shifts' }
                ]
            ];

            // Если смена уже завершена или неактивна, меняем кнопки
            if (shiftDetails.status !== 'active') {
                actionKeyboard[0] = [
                    { text: '✅ Активировать', callback_data: `admin_activate_shift_${shiftId}` }
                ];
            }

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: actionKeyboard }
            });

        } catch (error) {
            console.error('Ошибка при получении деталей смены:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке деталей');
        }
    });

    // Завершение смены
    bot.action(/^admin_complete_shift_/, async (ctx) => {
        try {
            const { shiftService, adminService } = await getServices();
            const isAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const callbackData = ctx.callbackQuery.data;
            const shiftId = callbackData.replace('admin_complete_shift_', '');
            
            await shiftService.completeShift(shiftId);
            await ctx.answerCbQuery('✅ Смена завершена!');
            
            // Обновляем сообщение
            await ctx.editMessageText(`✅ *СМЕНА #${shiftId} ЗАВЕРШЕНА!*\n\nСмена успешно завершена.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '↩️ К списку смен', callback_data: 'admin_shifts' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при завершении смены:', error);
            await ctx.answerCbQuery('❌ Ошибка при завершении смены');
        }
    });

    // Деактивация смены
    bot.action(/^admin_deactivate_shift_/, async (ctx) => {
        try {
            const { shiftService, adminService } = await getServices();
            const isAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const callbackData = ctx.callbackQuery.data;
            const shiftId = callbackData.replace('admin_deactivate_shift_', '');
            
            await shiftService.deactivateShift(shiftId);
            await ctx.answerCbQuery('✅ Смена деактивирована!');
            
            await ctx.editMessageText(`✅ *СМЕНА #${shiftId} ДЕАКТИВИРОВАНА!*\n\nСмена больше не активна.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '↩️ К списку смен', callback_data: 'admin_shifts' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при деактивации смены:', error);
            await ctx.answerCbQuery('❌ Ошибка при деактивации смены');
        }
    });

    // Активация смены
    bot.action(/^admin_activate_shift_/, async (ctx) => {
        try {
            const { shiftService, adminService } = await getServices();
            const isAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const callbackData = ctx.callbackQuery.data;
            const shiftId = callbackData.replace('admin_activate_shift_', '');
            
            await shiftService.updateShiftStatus(shiftId, 'active');
            await ctx.answerCbQuery('✅ Смена активирована!');
            
            await ctx.editMessageText(`✅ *СМЕНА #${shiftId} АКТИВИРОВАНА!*\n\nСмена снова доступна для записи.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '↩️ К списку смен', callback_data: 'admin_shifts' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при активации смены:', error);
            await ctx.answerCbQuery('❌ Ошибка при активации смены');
        }
    });

    // Редактирование смены (заглушка)
    bot.action(/^admin_edit_shift_/, async (ctx) => {
        await ctx.answerCbQuery('⚠️ Функция редактирования в разработке');
    });

    // Статистика смен
    bot.action('admin_shifts_stats', async (ctx) => {
        try {
            const { shiftService, adminService } = await getServices();
            const isAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            const stats = await shiftService.getShiftsStats();
            
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
                               `📈 *Средняя заполненность:* ${stats.averageFulfillment}%`;

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

    // Поиск смен по критериям
    bot.action('admin_find_shifts', async (ctx) => {
        try {
            const { shiftService, adminService } = await getServices();
            const isAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.answerCbQuery('❌ Недостаточно прав!');
                return;
            }

            ctx.session.adminAction = 'find_shifts';
            await ctx.editMessageText('🔍 *ПОИСК СМЕН*\n\nВведите критерии поиска:\n\n' +
                                   'Формат: дата отдел\n' +
                                   'Пример: 15.01.2024 Склад\n\n' +
                                   'Или просто отправьте дату для поиска', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '❌ Отмена', callback_data: 'admin_shifts' }]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при поиске смен:', error);
            await ctx.answerCbQuery('❌ Ошибка');
        }
    });

    // Обработка поиска смен
    bot.on('text', async (ctx) => {
        if (ctx.message.text.startsWith('/')) return;
        if (ctx.session.adminAction !== 'find_shifts') return;

        try {
            const { shiftService } = await getServices();
            const searchText = ctx.message.text.trim();
            
            let criteria = {};
            
            // Парсим введенные данные
            if (searchText.includes(' ')) {
                const parts = searchText.split(' ');
                criteria.date = parts[0];
                criteria.department = parts.slice(1).join(' ');
            } else {
                criteria.date = searchText;
            }
            
            const foundShifts = await shiftService.findShiftsByCriteria(criteria);
            
            if (foundShifts.length === 0) {
                await ctx.reply('❌ *Смены не найдены*\n\nПопробуйте другие критерии поиска.', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Попробовать снова', callback_data: 'admin_find_shifts' }],
                            [{ text: '↩️ Назад', callback_data: 'admin_shifts' }]
                        ]
                    }
                });
                return;
            }

            let message = `🔍 *РЕЗУЛЬТАТЫ ПОИСКА*\n\nНайдено ${foundShifts.length} смен:\n\n`;
            
            foundShifts.forEach((shift, index) => {
                message += `${index + 1}. 📅 ${shift.date} ${shift.time}\n`;
                message += `   🏢 ${shift.department}\n`;
                message += `   👥 ${shift.approved.length}/${shift.requiredPeople} чел.\n`;
                message += `   📊 ${shift.status}\n\n`;
            });

            const shiftsKeyboard = foundShifts.map(shift => [
                { 
                    text: `📅 ${formatDateShort(shift.date)}`, 
                    callback_data: `admin_shift_detail_${shift.id}`
                }
            ]);

            shiftsKeyboard.push([{ text: '↩️ Назад', callback_data: 'admin_shifts' }]);

            await ctx.reply(message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: shiftsKeyboard }
            });
            
            ctx.session.adminAction = null;

        } catch (error) {
            console.error('Ошибка при поиске смен:', error);
            await ctx.reply('❌ Ошибка при поиске смен. Попробуйте снова.');
            ctx.session.adminAction = null;
        }
    });

    // Команда для отладки
    bot.command('debug_shifts', async (ctx) => {
        try {
            const { shiftService, adminService } = await getServices();
            const isAdmin = await adminService.isAdmin(ctx.from.id);
            
            if (!isAdmin) {
                await ctx.reply('❌ Недостаточно прав!');
                return;
            }

            const shifts = await shiftService.getAllShifts();
            
            let debugInfo = '🔍 *ДЕБАГ СМЕН:*\n\n';
            
            shifts.forEach((shift, index) => {
                debugInfo += `*Смена ${index + 1}:* ${shift.date} ${shift.time} (${shift.department})\n`;
                debugInfo += `👥 Нужно: ${shift.requiredPeople}, Подтверждено: ${shift.approved.length}, Ожидают: ${shift.pendingApproval.length}\n`;
                debugInfo += `✅ Подтверждены: ${shift.approved.join(', ') || 'нет'}\n`;
                debugInfo += `⏳ Ожидают: ${shift.pendingApproval.join(', ') || 'нет'}\n`;
                debugInfo += `📝 Записаны: ${shift.signedUp.join(', ') || 'нет'}\n\n`;
            });

            await ctx.reply(debugInfo, { parse_mode: 'Markdown' });
            
        } catch (error) {
            console.error('Ошибка при отладке смен:', error);
            await ctx.reply('❌ Ошибка при отладке смен');
        }
    });
}

module.exports = { setupShiftHandlers };