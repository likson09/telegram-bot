const UserService = require('../services/user-service');
const { formatDateShort } = require('../../utils/formatters');

function setupProductivityHandlers(bot) {
    let userService = null;

    // Инициализация сервиса при первом использовании
    async function getUserService() {
        if (!userService) {
            userService = new UserService();
            await userService.connect();
        }
        return userService;
    }

    // Меню производительности
    bot.action('menu_show_productivity', async (ctx) => {
        try {
            const service = await getUserService();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }

            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth();
            
            const monthKeyboard = [];
            const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                              'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
            
            // Создаем меню за последние 6 месяцев
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
    });

    // Выбор месяца
    bot.action(/^month_/, async (ctx) => {
        try {
            const callbackData = ctx.callbackQuery.data;
            const parts = callbackData.split('_');
            
            if (parts.length < 3) {
                await ctx.answerCbQuery('❌ Ошибка формата');
                return;
            }
            
            const month = parseInt(parts[1]);
            const year = parseInt(parts[2]);
            
            // Проверка валидности данных
            if (isNaN(month) || isNaN(year) || month < 0 || month > 11) {
                await ctx.answerCbQuery('❌ Неверные параметры');
                return;
            }
            
            const service = await getUserService();
            const fullFio = ctx.session.userFio;
    
            if (!fullFio) {
                await ctx.answerCbQuery('❌ ФИО не найдено');
                return;
            }
            
            const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                               'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
            
            const monthName = monthNames[month];
            
            // Получаем данные производительности
            const productivityData = await service.getProductivityData(fullFio, year, month + 1);
            
            // Сохраняем данные в сессии для детализации
            ctx.session.currentProductivityData = {
                selectionData: productivityData.selectionData,
                placementData: productivityData.placementData,
                month: month,
                year: year,
                fullFio: fullFio,
                monthName: monthName
            };
    
            const totalSelection = productivityData.totalSelection;
            const totalPlacement = productivityData.totalPlacement;
    
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
                           `└ Среднее размещение/день: ${productivityData.avgPlacementPerDay} ед.\n\n` +
                           `📊 *ОБЩИЙ РЕЗУЛЬТАТ:* ${totalSelection + totalPlacement} ед.`;
            
            const detailKeyboard = [
                [{ text: '📋 Детализировать по дням', callback_data: `detail_${month}_${year}_1` }], // Страница 1
                [{ text: '📅 Выбрать другой месяц', callback_data: 'menu_show_productivity' }],
                [{ text: '↩️ Главное меню', callback_data: 'menu_back_main' }]
            ];
    
            await safeEditMessage(ctx, message, detailKeyboard);
            await ctx.answerCbQuery();
            
        } catch (error) {
            console.error('❌ Ошибка при выборе месяца:', error);
            await ctx.editMessageText('❌ Не удалось получить данные производительности. Попробуйте позже.', {
                reply_markup: { inline_keyboard: createBackButton('menu_show_productivity') }
            });
            await ctx.answerCbQuery();
        }
    });

// Детализация по дням с пагинацией (только дни с данными)
bot.action(/^detail_/, async (ctx) => {
    try {
        const sessionData = ctx.session.currentProductivityData;
        
        if (!sessionData) {
            await ctx.answerCbQuery('❌ Данные не найдены. Выберите месяц заново.');
            return;
        }

        const callbackData = ctx.callbackQuery.data;
        const parts = callbackData.split('_');
        
        // Определяем страницу (по умолчанию 1)
        let page = 1;
        if (parts.length >= 4) {
            page = parseInt(parts[3]) || 1;
        }
        
        const month = parseInt(parts[1]);
        const year = parseInt(parts[2]);
        
        // Проверяем соответствие данных в сессии и callback_data
        if (sessionData.month !== month || sessionData.year !== year) {
            await ctx.answerCbQuery('❌ Данные устарели. Выберите месяц заново.');
            return;
        }

        const { selectionData, placementData, fullFio, monthName } = sessionData;
        
        let message = `📋 *ДЕТАЛИЗАЦИЯ ПО ДНЯМ* • Страница ${page}\n\n`;
        message += `👤 *Сотрудник:* ${fullFio}\n`;
        message += `📅 *Период:* ${monthName} ${year}\n\n`;
        
        // Проверяем наличие данных
        if (!selectionData && !placementData) {
            message += `📭 *Данные отсутствуют*\n\nЗа выбранный период активность не зафиксирована.`;
            
            const backKeyboard = [
                [{ text: '📊 Назад к статистике', callback_data: `month_${month}_${year}` }],
                [{ text: '↩️ Главное меню', callback_data: 'menu_back_main' }]
            ];

            await safeEditMessage(ctx, message, backKeyboard);
            await ctx.answerCbQuery();
            return;
        }

        // Собираем все дни с данными
        const daysWithData = [];
        
        for (let day = 1; day <= 31; day++) {
            const selRm = selectionData ? (selectionData[`rm_day_${day}`] || 0) : 0;
            const selOs = selectionData ? (selectionData[`os_day_${day}`] || 0) : 0;
            const plRm = placementData ? (placementData[`rm_day_${day}`] || 0) : 0;
            const plOs = placementData ? (placementData[`os_day_${day}`] || 0) : 0;
            
            if (selRm > 0 || selOs > 0 || plRm > 0 || plOs > 0) {
                daysWithData.push({
                    day: day,
                    selRm: selRm,
                    selOs: selOs,
                    plRm: plRm,
                    plOs: plOs
                });
            }
        }

        // Если нет данных вообще
        if (daysWithData.length === 0) {
            message += `📭 *Данные отсутствуют*\n\nЗа выбранный период активность не зафиксирована.`;
            
            const backKeyboard = [
                [{ text: '📊 Назад к статистике', callback_data: `month_${month}_${year}` }],
                [{ text: '↩️ Главное меню', callback_data: 'menu_back_main' }]
            ];

            await safeEditMessage(ctx, message, backKeyboard);
            await ctx.answerCbQuery();
            return;
        }

        // Настройки пагинации
        const DAYS_PER_PAGE = 10; // 10 дней с данными на страницу
        const totalPages = Math.ceil(daysWithData.length / DAYS_PER_PAGE);
        
        // Ограничиваем страницу в допустимых пределах
        page = Math.max(1, Math.min(page, totalPages));
        
        const startIndex = (page - 1) * DAYS_PER_PAGE;
        const endIndex = Math.min(startIndex + DAYS_PER_PAGE, daysWithData.length);
        const currentDays = daysWithData.slice(startIndex, endIndex);

        message += `*Дни с данными:* ${startIndex + 1}-${endIndex} из ${daysWithData.length}\n\n`;

        // Выводим данные для текущей страницы
        currentDays.forEach(dayData => {
            const { day, selRm, selOs, plRm, plOs } = dayData;
            
            message += `📅 *${day.toString().padStart(2, '0')}.${(month + 1).toString().padStart(2, '0')}.*\n`;
            
            if (selRm > 0 || selOs > 0) {
                message += `📦 Отбор: `;
                if (selOs > 0) message += `ОС=${selOs} `;
                if (selRm > 0) message += `РМ=${selRm}`;
                message += `\n`;
            }
            
            if (plRm > 0 || plOs > 0) {
                message += `📋 Размещение: `;
                if (plOs > 0) message += `ОС=${plOs} `;
                if (plRm > 0) message += `РМ=${plRm}`;
                message += `\n`;
            }
            message += `\n`;
        });

        message += `*Страница ${page} из ${totalPages}*`;

        // Создаем клавиатуру с пагинацией
        const keyboard = [];
        
        // Кнопки пагинации
        const paginationButtons = [];
        
        if (page > 1) {
            paginationButtons.push({ 
                text: '⬅️ Назад', 
                callback_data: `detail_${month}_${year}_${page - 1}` 
            });
        }
        
        if (page < totalPages) {
            paginationButtons.push({ 
                text: 'Вперед ➡️', 
                callback_data: `detail_${month}_${year}_${page + 1}` 
            });
        }
        
        if (paginationButtons.length > 0) {
            keyboard.push(paginationButtons);
        }

        // Основные кнопки
        keyboard.push(
            [{ text: '📊 Назад к статистике', callback_data: `month_${month}_${year}` }],
            [{ text: '📅 Выбрать месяц', callback_data: 'menu_show_productivity' }],
            [{ text: '↩️ Главное меню', callback_data: 'menu_back_main' }]
        );

        await safeEditMessage(ctx, message, keyboard);
        await ctx.answerCbQuery();
        
    } catch (error) {
        console.error('❌ Ошибка при детализации:', error);
        await ctx.editMessageText('❌ Не удалось загрузить детализацию.', {
            reply_markup: { inline_keyboard: createBackButton() }
        });
    }
});


    // Команда для быстрой проверки производительности
    bot.command('prod', async (ctx) => {
        try {
            const service = await getUserService();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.reply('❌ Сначала отправьте ваше ФИО');
                return;
            }

            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;

            const productivityData = await service.getProductivityData(fullFio, currentYear, currentMonth);
            
            const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                               'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
            const monthName = monthNames[currentMonth - 1];

            const message = `🚀 *ПРОИЗВОДИТЕЛЬНОСТЬ ЗА ТЕКУЩИЙ МЕСЯЦ*\n\n` +
                           `👤 *Сотрудник:* ${fullFio}\n` +
                           `📅 *Период:* ${monthName} ${currentYear}\n\n` +
                           `📦 *Отбор товара:* ${productivityData.totalSelection} ед.\n` +
                           `📋 *Размещение товара:* ${productivityData.totalPlacement} ед.\n` +
                           `📊 *Общий результат:* ${productivityData.totalSelection + productivityData.totalPlacement} ед.\n\n` +
                           `📈 *Среднедневные показатели:*\n` +
                           `├ Отбор: ${productivityData.avgSelectionPerDay} ед./день\n` +
                           `└ Размещение: ${productivityData.avgPlacementPerDay} ед./день`;

            await ctx.reply(message, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📅 Подробная статистика', callback_data: 'menu_show_productivity' }],
                        [{ text: '↩️ Главное меню', callback_data: 'menu_back_main' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Ошибка в команде /prod:', error);
            await ctx.reply('❌ Ошибка при получении данных производительности');
        }
    });

    // Команда для сравнения производительности
    bot.command('compare', async (ctx) => {
        try {
            const service = await getUserService();
            const fullFio = ctx.session.userFio;

            if (!fullFio) {
                await ctx.reply('❌ Сначала отправьте ваше ФИО');
                return;
            }

            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
            const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

            // Получаем данные за текущий и предыдущий месяц
            const [currentData, prevData] = await Promise.all([
                service.getProductivityData(fullFio, currentYear, currentMonth),
                service.getProductivityData(fullFio, prevYear, prevMonth)
            ]);

            const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                               'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

            const currentMonthName = monthNames[currentMonth - 1];
            const prevMonthName = monthNames[prevMonth - 1];

            // Рассчитываем изменения
            const selectionChange = currentData.totalSelection - prevData.totalSelection;
            const placementChange = currentData.totalPlacement - prevData.totalPlacement;
            const totalChange = (currentData.totalSelection + currentData.totalPlacement) - 
                              (prevData.totalSelection + prevData.totalPlacement);

            const selectionTrend = selectionChange > 0 ? '📈' : selectionChange < 0 ? '📉' : '➡️';
            const placementTrend = placementChange > 0 ? '📈' : placementChange < 0 ? '📉' : '➡️';
            const totalTrend = totalChange > 0 ? '📈' : totalChange < 0 ? '📉' : '➡️';

            const message = `📊 *СРАВНЕНИЕ ПРОИЗВОДИТЕЛЬНОСТИ*\n\n` +
                           `👤 *Сотрудник:* ${fullFio}\n\n` +
                           `📅 *${currentMonthName} ${currentYear}:*\n` +
                           `├ 📦 Отбор: ${currentData.totalSelection} ед. ${selectionTrend}\n` +
                           `├ 📋 Размещение: ${currentData.totalPlacement} ед. ${placementTrend}\n` +
                           `└ 📊 Всего: ${currentData.totalSelection + currentData.totalPlacement} ед. ${totalTrend}\n\n` +
                           `📅 *${prevMonthName} ${prevYear}:*\n` +
                           `├ 📦 Отбор: ${prevData.totalSelection} ед.\n` +
                           `├ 📋 Размещение: ${prevData.totalPlacement} ед.\n` +
                           `└ 📊 Всего: ${prevData.totalSelection + prevData.totalPlacement} ед.\n\n` +
                           `📈 *Изменения:*\n` +
                           `├ Отбор: ${selectionChange >= 0 ? '+' : ''}${selectionChange} ед.\n` +
                           `├ Размещение: ${placementChange >= 0 ? '+' : ''}${placementChange} ед.\n` +
                           `└ Общее: ${totalChange >= 0 ? '+' : ''}${totalChange} ед.`;

            await ctx.reply(message, { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📅 Детальная статистика', callback_data: 'menu_show_productivity' }],
                        [{ text: '↩️ Главное меню', callback_data: 'menu_back_main' }]
                    ]
                }
            });
            
        } catch (error) {
            console.error('Ошибка в команде /compare:', error);
            await ctx.reply('❌ Ошибка при сравнении производительности');
        }
    });

    // Безопасное редактирование сообщения
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

    // Вспомогательная функция для кнопки "Назад"
    function createBackButton(backTo = 'menu_show_productivity') {
        return [
            [{ text: '↩️ Назад', callback_data: backTo }]
        ];
    }
}

module.exports = { setupProductivityHandlers };