const ShiftService = require('../services/shift-service');
const UserService = require('../services/user-service');
const { formatDateShort, truncateName } = require('../../utils/formatters');

function setupApplicationHandlers(bot) {
    let shiftService = null;
    let userService = null;

    // Инициализация сервисов
    async function getServices() {
        if (!shiftService) {
            shiftService = new ShiftService();
            await shiftService.connect();
        }
        if (!userService) {
            userService = new UserService();
            await userService.connect();
        }
        return { shiftService, userService };
    }

    // Меню подработок
    bot.action('menu_show_work', async (ctx) => {
        try {
            const { userService } = await getServices();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }

            const workMenu = [
                [
                    { text: '📋 Доступные смены', callback_data: 'work_shifts_list' },
                    { text: '📝 Мои заявки', callback_data: 'work_my_applications' }
                ],
                [
                    { text: '↩️ Назад', callback_data: 'menu_back_main' }
                ]
            ];

            await ctx.editMessageText(`💼 *ПОДРАБОТКИ*\n\n👤 ${fullFio}`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: workMenu }
            });
        } catch (error) {
            console.error('Ошибка при открытии меню подработок:', error);
            await ctx.editMessageText('❌ Ошибка открытия меню', {
                reply_markup: { inline_keyboard: createBackButton('menu_back_main') }
            });
        }
    });

    // Список доступных смен
    bot.action('work_shifts_list', async (ctx) => {
        try {
            const { shiftService, userService } = await getServices();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }

            // Сохраняем пользователя в базе
            await userService.saveUser(fullFio, ctx.from.id);

            const availableShifts = await shiftService.getAvailableShifts();
            ctx.session.availableShifts = availableShifts;
            
            if (availableShifts.length === 0) {
                await ctx.editMessageText('📭 *На данный момент нет доступных смен для подработки.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: 'menu_show_work' }]] }
                });
                return;
            }

            const shiftsKeyboard = availableShifts.map(shift => [
                { 
                    text: `📅 ${formatDateShort(shift.date)} ${shift.time}`, 
                    callback_data: `shift_detail_${shift.id}`
                }
            ]);

            shiftsKeyboard.push([{ text: '↩️ Назад', callback_data: 'menu_show_work' }]);

            await ctx.editMessageText(`📋 *ДОСТУПНЫЕ СМЕНЫ*\n\nНайдено ${availableShifts.length} активных смен:`, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: shiftsKeyboard }
            });
            
        } catch (error) {
            console.error('Ошибка при получении списка смен:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке смен');
        }
    });

    // Детали смены
    bot.action(/^shift_detail_/, async (ctx) => {
        try {
            const { shiftService } = await getServices();
            const callbackData = ctx.callbackQuery.data;
            const shiftId = callbackData.replace('shift_detail_', '');
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }

            const shift = await shiftService.getShiftById(shiftId);
            
            if (!shift) {
                await ctx.answerCbQuery('❌ Смена не найдена');
                await ctx.editMessageText('❌ *Смена не найдена*', {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Обновить список', callback_data: 'work_shifts_list' }],
                            [{ text: '↩️ Назад', callback_data: 'menu_show_work' }]
                        ]
                    }
                });
                return;
            }

            const shiftInfo = `📅 *ДЕТАЛИ СМЕНЫ*\n\n` +
                             `🗓️ *Дата:* ${shift.date}\n` +
                             `⏰ *Время:* ${shift.time}\n` +
                             `🏢 *Отдел:* ${shift.department}\n` +
                             `👥 *Требуется человек:* ${shift.requiredPeople}\n` +
                             `✅ *Подтверждено:* ${shift.approved.length}/${shift.requiredPeople}\n` +
                             `⏳ *Ожидают подтверждения:* ${shift.pendingApproval.length}\n\n`;

            // Проверяем статусы пользователя
            const userStatus = [];
            const userInApproved = shift.approved.some(item => item.startsWith(fullFio + '|'));
            const userInPending = shift.pendingApproval.some(item => item.startsWith(fullFio + '|'));
            const userInSigned = shift.signedUp.some(item => item.startsWith(fullFio + '|'));

            if (userInApproved) {
                userStatus.push('✅ *Ваша заявка подтверждена руководителем*');
            } else if (userInPending) {
                userStatus.push('⏳ *Ваша заявка на рассмотрении*');
            } else if (userInSigned) {
                userStatus.push('📝 *Вы записаны на эту смену*');
            }
            
            let statusMessage = '';
            if (userStatus.length > 0) {
                statusMessage = `${userStatus.join('\n')}\n\n`;
            }
            
            // Проверяем, можно ли еще записываться
            const availableSlots = shift.requiredPeople - (shift.approved.length + shift.pendingApproval.length);
            let actionMessage = '';
            
            if (availableSlots <= 0) {
                actionMessage = '❌ *Мест больше нет*\nНа эту смену уже набрано достаточное количество человек.';
            } else if (userInApproved) {
                actionMessage = '🎉 *Ваша заявка уже подтверждена!* Ждем вас на смене.';
            } else if (userInPending || userInSigned) {
                actionMessage = 'ℹ️ *Вы уже подали заявку* на эту смену.';
            } else {
                actionMessage = `✅ *Есть свободные места:* ${availableSlots} из ${shift.requiredPeople}`;
            }

            const detailKeyboard = [];

            // Добавляем кнопку записи только если есть места и пользователь еще не записан
            if (availableSlots > 0 && !userInApproved && !userInPending && !userInSigned) {
                detailKeyboard.push([
                    { 
                        text: '📝 Записаться на смену', 
                        callback_data: `shift_signup_${shiftId}`
                    }
                ]);
            }

            detailKeyboard.push([
                { text: '↩️ Назад к списку', callback_data: 'work_shifts_list' }
            ]);

            const fullMessage = shiftInfo + statusMessage + actionMessage;

            await ctx.editMessageText(fullMessage, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: detailKeyboard }
            });
            
            await ctx.answerCbQuery();
            
        } catch (error) {
            console.error('❌ Ошибка при получении деталей смены:', error);
            await ctx.editMessageText('❌ *Ошибка при загрузке деталей смены*', {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🔄 Попробовать снова', callback_data: 'work_shifts_list' }],
                        [{ text: '↩️ Назад', callback_data: 'menu_show_work' }]
                    ]
                }
            });
            await ctx.answerCbQuery('❌ Ошибка при загрузке деталей смены');
        }
    });

    // Запись на смену
    bot.action(/^shift_signup_/, async (ctx) => {
        try {
            const { shiftService, userService } = await getServices();
            const callbackData = ctx.callbackQuery.data;
            const shiftId = callbackData.replace('shift_signup_', '');
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }

            const result = await shiftService.signUpForShift(ctx.from.id, fullFio, shiftId);
            
            if (result.success) {
                await ctx.answerCbQuery('✅ Заявка подана! Ожидайте подтверждения руководителя.');
                
                await ctx.editMessageText('✅ *ЗАЯВКА ПОДАНА!*\n\n' +
                                       `📅 Смена: ${result.shift.date} ${result.shift.time}\n` +
                                       `🏢 Отдел: ${result.shift.department}\n` +
                                       `⏳ Статус: Ожидает подтверждения\n\n` +
                                       `Осталось свободных мест: ${result.availableSlots}`, {
                    parse_mode: 'Markdown',
                    reply_markup: { 
                        inline_keyboard: [
                            [{ text: '📋 Мои заявки', callback_data: 'work_my_applications' }],
                            [{ text: '↩️ К списку смен', callback_data: 'work_shifts_list' }]
                        ]
                    }
                });
            }
            
        } catch (error) {
            console.error('Ошибка при записи на смену:', error);
            await ctx.answerCbQuery(`❌ ${error.message}`);
            
            // Показываем сообщение об ошибке
            await ctx.editMessageText(`❌ *Ошибка записи:*\n\n${error.message}`, {
                parse_mode: 'Markdown',
                reply_markup: { 
                    inline_keyboard: [
                        [{ text: '🔄 Попробовать снова', callback_data: `shift_detail_${shiftId}` }],
                        [{ text: '↩️ Назад', callback_data: 'work_shifts_list' }]
                    ]
                }
            });
        }
    });

    // Мои заявки
    bot.action('work_my_applications', async (ctx) => {
        try {
            const { userService } = await getServices();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }

            const applications = await userService.getUserApplications(fullFio);

            if (applications.length === 0) {
                await ctx.editMessageText('📭 *У вас нет активных заявок на подработку.*', {
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: '↩️ Назад', callback_data: 'menu_show_work' }]] }
                });
                return;
            }

            let message = '📋 *МОИ ЗАЯВКИ НА ПОДРАБОТКУ:*\n\n';
            
            applications.forEach((app, index) => {
                const userStatus = app.approved.some(item => item.startsWith(fullFio + '|')) ? 
                    '✅ Подтверждена' : 
                    app.pendingApproval.some(item => item.startsWith(fullFio + '|')) ?
                    '⏳ Ожидает подтверждения' : '📝 Записана';
                
                const statusIcon = userStatus === '✅ Подтверждена' ? '✅' : 
                                 userStatus === '⏳ Ожидает подтверждения' ? '⏳' : '📝';
                
                message += `${index + 1}. ${statusIcon} *${app.date} ${app.time}*\n`;
                message += `   🏢 ${app.department}\n`;
                message += `   👥 ${app.approved.length}/${app.requiredPeople} человек\n`;
                message += `   📝 ${userStatus}\n\n`;
            });

            message += `*Всего заявок:* ${applications.length}`;

            await ctx.editMessageText(message, {
                parse_mode: 'Markdown',
                reply_markup: { 
                    inline_keyboard: [
                        [{ text: '🔄 Обновить список', callback_data: 'work_my_applications' }],
                        [{ text: '📋 Доступные смены', callback_data: 'work_shifts_list' }],
                        [{ text: '↩️ Назад', callback_data: 'menu_show_work' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('❌ Ошибка при получении заявок:', error);
            await ctx.answerCbQuery('❌ Ошибка при загрузке заявок');
            
            await ctx.editMessageText('❌ *Ошибка при загрузке ваших заявок*', {
                parse_mode: 'Markdown',
                reply_markup: { 
                    inline_keyboard: [
                        [{ text: '🔄 Попробовать снова', callback_data: 'work_my_applications' }],
                        [{ text: '↩️ Назад', callback_data: 'menu_show_work' }]
                    ]
                }
            });
        }
    });

    // Отмена записи на смену (дополнительная функция)
    bot.action(/^shift_cancel_/, async (ctx) => {
        try {
            const { shiftService } = await getServices();
            const callbackData = ctx.callbackQuery.data;
            const shiftId = callbackData.replace('shift_cancel_', '');
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }

            const success = await shiftService.cancelSignUp(fullFio, shiftId);
            
            if (success) {
                await ctx.answerCbQuery('✅ Запись отменена!');
                
                await ctx.editMessageText('✅ *ЗАПИСЬ ОТМЕНЕНА!*\n\n' +
                                       'Вы больше не записаны на эту смену.', {
                    parse_mode: 'Markdown',
                    reply_markup: { 
                        inline_keyboard: [
                            [{ text: '📋 Мои заявки', callback_data: 'work_my_applications' }],
                            [{ text: '📋 Доступные смены', callback_data: 'work_shifts_list' }]
                        ]
                    }
                });
            }
            
        } catch (error) {
            console.error('Ошибка при отмене записи:', error);
            await ctx.answerCbQuery(`❌ ${error.message}`);
        }
    });

    // Команда для быстрой записи
    bot.command('pod', async (ctx) => {
        try {
            const fullFio = ctx.session.userFio;
            
            if (!fullFio) {
                await ctx.reply('❌ Сначала отправьте ваше ФИО');
                return;
            }

            const { shiftService } = await getServices();
            const availableShifts = await shiftService.getAvailableShifts();
            
            if (availableShifts.length === 0) {
                await ctx.reply('📭 На данный момент нет доступных смен для подработки.');
                return;
            }

            const shiftsKeyboard = availableShifts.map(shift => [
                { 
                    text: `📅 ${formatDateShort(shift.date)} ${shift.time}`, 
                    callback_data: `shift_detail_${shift.id}`
                }
            ]);

            await ctx.reply('💼 *БЫСТРАЯ ЗАПИСЬ НА ПОДРАБОТКУ*\n\nВыберите смену:', {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: shiftsKeyboard }
            });
            
        } catch (error) {
            console.error('Ошибка в команде /pod:', error);
            await ctx.reply('❌ Ошибка при загрузке смен');
        }
    });

    // Вспомогательная функция для кнопки "Назад"
    function createBackButton(backTo = 'menu_show_work') {
        return [
            [{ text: '↩️ Назад', callback_data: backTo }]
        ];
    }
}

module.exports = { setupApplicationHandlers };