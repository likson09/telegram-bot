const { getSheetData } = require('../sheets');

async function checkEmployeeExists(fio) {
    const tables = ['Ошибки!A:A', 'Табель!A:Z', 'Отбор!A:A', 'Размещение!A:A'];
    for (const range of tables) {
        const rows = await getSheetData(range);
        const found = rows.some(row => row.some(cell => cell && cell.toString().trim() === fio));
        if (found) return true;
    }
    return false;
}

async function findUserIdByFio(fio) {
    const rows = await getSheetData('Пользователи!A:B');
    for (const row of rows) {
        if (row[0] === fio && row[1]) return parseInt(row[1]);
    }
    return null;
}

module.exports = { checkEmployeeExists, findUserIdByFio };