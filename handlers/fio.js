const { validateFIO } = require('../utils/validation');
const { checkEmployeeExists } = require('../services/user');

module.exports = (bot) => {
    bot.on('text', async (ctx) => {
        if (ctx.message.text.startsWith('/')) return;
        const fio = ctx.message.text.trim();
        if (!validateFIO(fio)) return ctx.reply('❌ Неверный формат ФИО');
        if (!await checkEmployeeExists(fio)) return ctx.reply('❌ Сотрудник не найден');

        ctx.session.userFio = fio;
        ctx.session.userId = ctx.from.id;

        await ctx.reply(`👤 ${fio}\nВыберите действие:`, {
            reply_markup: { inline_keyboard: [
                [{ text: '💼 Подработка', callback_data: 'menu_work' }],
                [{ text: '📊 Ошибки', callback_data: 'menu_errors' }]
            ]}
        });
    });
};