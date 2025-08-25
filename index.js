const bot = require('./bot');
const { connectToGoogleSheets } = require('./sheets');
const app = require('./web/server');
const PORT = process.env.PORT || 3000;

// Подключаем Google Sheets
connectToGoogleSheets().catch(console.error);

// Подключаем обработчики
[
    require('./handlers/start'),
    require('./handlers/fio'),
    require('./handlers/work'),
    require('./handlers/admin'),
    require('./handlers/debug')
].forEach(handler => handler(bot));

// Запуск
if (process.env.RENDER) {
    app.use(bot.webhookCallback('/webhook'));
    app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
    bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/webhook`);
} else {
    bot.launch({ polling: true }).then(() => console.log('✅ Бот запущен'));
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));