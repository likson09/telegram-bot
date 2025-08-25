const { getAvailableShifts, updateShiftInSheet } = require('./shifts');
const { notifyUser } = require('./notifications');

async function signUpForShift(bot, userId, userName, shiftId) {
    const shifts = await getAvailableShifts();
    const shift = shifts.find(s => s.id === shiftId.toString());
    if (!shift) throw new Error('Смена не найдена');

    const userWithId = `${userName}|${userId}`;
    if (shift.pendingApproval.includes(userWithId) || shift.approved.includes(userWithId)) {
        throw new Error('Вы уже подали заявку');
    }

    if (shift.approved.length + shift.pendingApproval.length >= shift.requiredPeople) {
        throw new Error('Нет свободных мест');
    }

    shift.pendingApproval.push(userWithId);
    await updateShiftInSheet(shift);

    await notifyUser(bot, userId, `✅ Заявка подана! Ожидайте подтверждения.`);
    return true;
}

module.exports = { signUpForShift };