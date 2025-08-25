const { google } = require('googleapis');
const { SPREADSHEET_ID } = require('./config');

let googleSheetsClient = null;

function loadGoogleCredentials() {
    try {
        if (process.env.GOOGLE_CREDENTIALS) {
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
            if (!credentials.private_key || !credentials.client_email) {
                throw new Error('Невалидные credentials');
            }
            return credentials;
        }
        throw new Error('GOOGLE_CREDENTIALS не найдены');
    } catch (error) {
        console.error('❌ Ошибка загрузки credentials:', error.message);
        throw error;
    }
}

async function connectToGoogleSheets() {
    try {
        const credentials = loadGoogleCredentials();
        const auth = new google.auth.JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        await auth.authorize();
        googleSheetsClient = google.sheets({ version: 'v4', auth });
        console.log('✅ Google Sheets подключён');
        return googleSheetsClient;
    } catch (error) {
        console.error('❌ Ошибка подключения к Google Sheets:', error.message);
        throw error;
    }
}

async function getSheetData(range) {
    try {
        const result = await googleSheetsClient.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range
        });
        return result.data.values || [];
    } catch (error) {
        console.error('❌ Ошибка получения данных:', error.message);
        throw new Error('Не удалось получить данные');
    }
}

module.exports = {
    connectToGoogleSheets,
    getSheetData,
    get googleSheetsClient() { return googleSheetsClient; }
};