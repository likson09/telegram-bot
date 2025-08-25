module.exports = (bot) => {
    bot.start(async (ctx) => {
        const isUserAdmin = await require('../services/admin').isAdmin(ctx.from.id);
        await ctx.reply(`👋 Добро пожаловать! ${isUserAdmin ? '(👑 Админ)' : ''}\n📝 Отправьте ФИО`, {
            parse_mode: 'Markdown'
        });
    });
};