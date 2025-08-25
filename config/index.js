require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SUPER_ADMIN_ID = parseInt(process.env.SUPER_ADMIN_ID) || 566632489;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN не задан');
if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID не задан');

module.exports = {
    BOT_TOKEN,
    SPREADSHEET_ID,
    SUPER_ADMIN_ID
};