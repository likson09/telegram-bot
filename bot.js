const { Telegraf } = require('telegraf');
const { BOT_TOKEN } = require('./config');
const sessionMiddleware = require('./middleware/session');

const bot = new Telegraf(BOT_TOKEN);

bot.use(sessionMiddleware);

module.exports = bot;