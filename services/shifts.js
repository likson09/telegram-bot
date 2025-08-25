const { getSheetData } = require('../sheets');
const { parseDate } = require('../utils/helpers');

async function getAvailableShifts() {
    const rows = await getSheetData('Подработки!A:I');
    if (rows.length < 2) return [];

    const shifts = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[1] || !row[3]) continue;

        const shift = {
            id: row[0]?.toString() || i,
            date: row[1] || 'Не указана',
            time: row[2] || 'Не указано',
            department: row[3] || 'Не указан',
            requiredPeople: Math.max(0, parseInt(row[4]) || 0),
            status: ['active', 'активно'].includes((row[6] || '').toLowerCase()) ? 'active' : 'inactive',
            pendingApproval: (row[7] || '').split(',').map(s => s.trim()).filter(Boolean),
            approved: (row[8] || '').split(',').map(s => s.trim()).filter(Boolean)
        };

        if (shift.status === 'active') shifts.push(shift);
    }

    shifts.sort((a, b) => parseDate(b.date) - parseDate(a.date));
    return shifts;
}

async function updateShiftInSheet(shift) {
    const rows = await getSheetData('Подработки!A:A');
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][0]?.toString() === shift.id.toString()) {
            rowIndex = i + 1;
            break;
        }
    }
    if (rowIndex === -1) throw new Error('Смена не найдена');

    // Обновление
    await global.googleSheetsClient.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: `Подработки!A${rowIndex}:I${rowIndex}`,
        valueInputOption: 'RAW',
        resource: {
            values: [[
                shift.id, shift.date, shift.time, shift.department,
                shift.requiredPeople, '', shift.status,
                shift.pendingApproval.join(','),
                shift.approved.join(',')
            ]]
        }
    });
}

module.exports = { getAvailableShifts, updateShiftInSheet };