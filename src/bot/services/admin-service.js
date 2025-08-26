const GoogleSheetsService = require('./google-sheets');

class AdminService extends GoogleSheetsService {
    constructor() {
        super();
    }

    // Управление администраторами
    async getAdmins() {
        try {
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Администраторы!A:A'
            });
            
            const rows = result.data.values || [];
            return rows.slice(1).map(row => parseInt(row[0])).filter(id => !isNaN(id));
        } catch (error) {
            console.error('Ошибка при получении списка администраторов:', error);
            return [this.SUPER_ADMIN_ID];
        }
    }

    async addAdmin(userId) {
        try {
            const currentAdmins = await this.getAdmins();
            
            if (currentAdmins.includes(userId)) {
                throw new Error('Пользователь уже является администратором');
            }
            
            await this.client.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Администраторы!A:A',
                valueInputOption: 'RAW',
                resource: {
                    values: [[userId]]
                }
            });
            
            console.log(`✅ Администратор добавлен: ${userId}`);
            return true;
        } catch (error) {
            console.error('Ошибка при добавлении администратора:', error);
            throw error;
        }
    }

    async removeAdmin(userId) {
        try {
            if (userId === this.SUPER_ADMIN_ID) {
                throw new Error('Нельзя удалить супер-администратора');
            }
            
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Администраторы!A:A'
            });
            
            const rows = result.data.values || [];
            const updatedRows = rows.filter((row, index) => {
                if (index === 0) return true; // Заголовок
                if (parseInt(row[0]) === this.SUPER_ADMIN_ID) return true; // Супер-админ
                return parseInt(row[0]) !== userId; // Удаляем целевого админа
            });
            
            await this.client.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Администраторы!A:A',
                valueInputOption: 'RAW',
                resource: {
                    values: updatedRows
                }
            });
            
            console.log(`✅ Администратор удален: ${userId}`);
            return true;
        } catch (error) {
            console.error('Ошибка при удалении администратора:', error);
            throw error;
        }
    }

    async isAdmin(userId) {
        if (userId === this.SUPER_ADMIN_ID) return true;
        
        try {
            const admins = await this.getAdmins();
            return admins.includes(userId);
        } catch (error) {
            console.error('Ошибка при проверке прав администратора:', error);
            return false;
        }
    }

    // Статистика системы
    async getAdminStats() {
        try {
            const shifts = await this.getAvailableShifts();
            
            const stats = {
                totalShifts: shifts.length,
                activeShifts: shifts.filter(s => s.status === 'active').length,
                completedShifts: shifts.filter(s => s.status === 'completed').length,
                totalApplications: shifts.reduce((acc, shift) => acc + shift.pendingApproval.length + shift.approved.length, 0),
                pendingApplications: shifts.reduce((acc, shift) => acc + shift.pendingApproval.length, 0),
                approvedApplications: shifts.reduce((acc, shift) => acc + shift.approved.length, 0),
                fulfillmentRate: 0
            };

            // Расчет процента заполненности
            if (stats.totalApplications > 0) {
                stats.fulfillmentRate = Math.round((stats.approvedApplications / stats.totalApplications) * 100);
            }

            return stats;
        } catch (error) {
            console.error('Ошибка при получении статистики:', error);
            return null;
        }
    }

    // Управление сменами
    async createShift(shiftData) {
        try {
            const shifts = await this.getAvailableShifts();
            const newId = shifts.length > 0 ? Math.max(...shifts.map(s => parseInt(s.id))) + 1 : 1;
            
            await this.client.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Подработки!A:I',
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        newId,
                        shiftData.date,
                        shiftData.time,
                        shiftData.department,
                        shiftData.requiredPeople,
                        '', // signedUp
                        'active', // status
                        '', // pendingApproval
                        ''  // approved
                    ]]
                }
            });
            
            console.log(`✅ Смена создана: ID ${newId}, ${shiftData.date} ${shiftData.time}`);
            return newId;
        } catch (error) {
            console.error('Ошибка при создании смены:', error);
            throw error;
        }
    }

    async updateShiftStatus(shiftId, status) {
        try {
            const shifts = await this.getAllShifts();
            const shift = shifts.find(s => s.id.toString() === shiftId.toString());
            
            if (!shift) {
                throw new Error('Смена не найдена');
            }
            
            // ИСПРАВЛЕННЫЙ ВЫЗОВ - передаем ID и обновления
            await this.updateShiftInSheet(shiftId, { status });
            
            console.log(`✅ Статус смены ${shiftId} изменен на: ${status}`);
            return true;
        } catch (error) {
            console.error('Ошибка при изменении статуса смены:', error);
            throw error;
        }
    }

    async deleteShift(shiftId) {
        try {
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Подработки!A:A'
            });
            
            const rows = result.data.values || [];
            let rowIndex = -1;
            
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0] && rows[i][0].toString() === shiftId.toString()) {
                    rowIndex = i + 1;
                    break;
                }
            }
            
            if (rowIndex === -1) {
                throw new Error('Смена не найдена');
            }
            
            // Очищаем строку вместо удаления (более безопасно)
            await this.client.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `Подработки!A${rowIndex}:I${rowIndex}`,
                valueInputOption: 'RAW',
                resource: {
                    values: [['', '', '', '', '', '', 'inactive', '', '']]
                }
            });
            
            console.log(`✅ Смена ${shiftId} деактивирована`);
            return true;
        } catch (error) {
            console.error('Ошибка при удалении смены:', error);
            throw error;
        }
    }

    // Управление заявками
    async getPendingApplications() {
        try {
            const shifts = await this.getAvailableShifts();
            const applications = [];
            
            for (const shift of shifts) {
                for (const userString of shift.pendingApproval) {
                    const userName = this.extractUserName(userString);
                    applications.push({
                        shiftId: shift.id,
                        userName: userName,
                        userString: userString,
                        date: shift.date,
                        time: shift.time,
                        department: shift.department,
                        requiredPeople: shift.requiredPeople,
                        approvedCount: shift.approved.length,
                        shift: shift
                    });
                }
            }
            
            return applications;
        } catch (error) {
            console.error('Ошибка при получении заявок:', error);
            return [];
        }
    }

    // В AdminService добавьте этот метод
async updateShiftInSheet(shiftId, updates) {
    try {
        // Находим строку смены
        const shifts = await this.getValues('Подработки!A:I');
        let rowIndex = -1;

        for (let i = 1; i < shifts.length; i++) {
            if (shifts[i][0] && shifts[i][0].toString() === shiftId.toString()) {
                rowIndex = i + 1; // +1 потому что строки в Sheets начинаются с 1
                break;
            }
        }

        if (rowIndex === -1) {
            throw new Error(`Смена с ID ${shiftId} не найдена`);
        }

        // Обновляем нужные поля
        const range = `Подработки!A${rowIndex}:I${rowIndex}`;
        const currentRow = shifts[rowIndex - 1];
        
        // Применяем обновления
        if (updates.signedUp !== undefined) {
            currentRow[5] = Array.isArray(updates.signedUp) ? updates.signedUp.join(', ') : updates.signedUp;
        }
        
        if (updates.pendingApproval !== undefined) {
            currentRow[7] = Array.isArray(updates.pendingApproval) ? updates.pendingApproval.join(', ') : updates.pendingApproval;
        }
        
        if (updates.approved !== undefined) {
            currentRow[8] = Array.isArray(updates.approved) ? updates.approved.join(', ') : updates.approved;
        }
        
        if (updates.status !== undefined) {
            currentRow[6] = updates.status;
        }

        if (updates.date !== undefined) {
            currentRow[1] = updates.date;
        }

        if (updates.time !== undefined) {
            currentRow[2] = updates.time;
        }

        if (updates.department !== undefined) {
            currentRow[3] = updates.department;
        }

        if (updates.requiredPeople !== undefined) {
            currentRow[4] = updates.requiredPeople;
        }

        // Записываем изменения
        await this.updateValues(range, [currentRow]);
        
        console.log(`✅ Смена ${shiftId} обновлена в таблице`);
        return true;

    } catch (error) {
        console.error('❌ Ошибка при обновлении смены в таблице:', error);
        throw error;
    }
}

async approveApplication(shiftId, userString, adminId) {
    try {
        console.log(`🔍 Подтверждение заявки: ${userString} на смену ${shiftId}`);
        
        const shifts = await this.getAvailableShifts();
        const shift = shifts.find(s => s.id.toString() === shiftId.toString());
        
        if (!shift) {
            throw new Error('Смена не найдена');
        }
        
        if (!shift.pendingApproval.includes(userString)) {
            throw new Error('Заявка не найдена в ожидающих');
        }
        
        const userName = this.extractUserName(userString);
        const userId = this.extractUserId(userString);
        
        // Переносим из pending в approved
        const updatedPending = shift.pendingApproval.filter(item => item !== userString);
        const updatedApproved = [...shift.approved, userString];
        
        // ИСПРАВЛЕННЫЙ ВЫЗОВ - передаем ID и обновления
        await this.updateShiftInSheet(shiftId, {
            pendingApproval: updatedPending,
            approved: updatedApproved
        });
        
        console.log(`✅ Заявка подтверждена: ${userName} на смену ${shiftId}`);
        
        return { 
            success: true, 
            shift: { ...shift, pendingApproval: updatedPending, approved: updatedApproved },
            userName,
            userId 
        };
    } catch (error) {
        console.error('❌ Ошибка при подтверждении заявки:', error);
        throw error;
    }
}

async rejectApplication(shiftId, userString, adminId) {
    try {
        console.log(`❌ Отклонение заявки: ${userString} на смену ${shiftId}`);
        
        const shifts = await this.getAvailableShifts();
        const shift = shifts.find(s => s.id.toString() === shiftId.toString());
        
        if (!shift) {
            throw new Error('Смена не найдена');
        }
        
        if (!shift.pendingApproval.includes(userString)) {
            throw new Error('Заявка не найдена в ожидающих');
        }
        
        const userName = this.extractUserName(userString);
        
        // Удаляем из pending
        const updatedPending = shift.pendingApproval.filter(item => item !== userString);
        
        // ИСПРАВЛЕННЫЙ ВЫЗОВ - передаем ID и обновления
        await this.updateShiftInSheet(shiftId, {
            pendingApproval: updatedPending
        });
        
        console.log(`✅ Заявка отклонена: ${userName} на смену ${shiftId}`);
        
        return { 
            success: true, 
            shift: { ...shift, pendingApproval: updatedPending },
            userName 
        };
    } catch (error) {
        console.error('Ошибка при отклонении заявки:', error);
        throw error;
    }
}

    // Получение всех смен (включая неактивные)
    async getAllShifts() {
        try {
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Подработки!A:I'
            });
            
            const rows = result.data.values || [];
            if (rows.length < 2) return [];
            
            const shifts = [];
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;
                
                const shift = {
                    id: row[0]?.toString() || i.toString(),
                    date: row[1] || 'Не указана',
                    time: row[2] || 'Не указано',
                    department: row[3] || 'Не указан',
                    requiredPeople: parseInt(row[4] || 0),
                    signedUp: [],
                    status: row[6] || 'active',
                    pendingApproval: [],
                    approved: []
                };
                
                if (row[5]) shift.signedUp = row[5].split(',').filter(Boolean);
                if (row[7]) shift.pendingApproval = row[7].split(',').filter(Boolean);
                if (row[8]) shift.approved = row[8].split(',').filter(Boolean);
                
                shifts.push(shift);
            }
            
            return shifts;
            
        } catch (error) {
            console.error('Ошибка при получении всех смен:', error);
            return [];
        }
    }

    // Получение смен по статусу
    async getShiftsByStatus(status) {
        try {
            const allShifts = await this.getAllShifts();
            return allShifts.filter(shift => shift.status === status);
        } catch (error) {
            console.error('Ошибка при получении смен по статусу:', error);
            return [];
        }
    }

    // Получение информации о конкретной смене
    async getShiftDetails(shiftId) {
        try {
            const shifts = await this.getAllShifts();
            const shift = shifts.find(s => s.id.toString() === shiftId.toString());
            
            if (!shift) {
                throw new Error('Смена не найдена');
            }
            
            // Детальная информация о смене
            return {
                ...shift,
                availableSlots: shift.requiredPeople - (shift.approved.length + shift.pendingApproval.length),
                fulfillmentPercentage: shift.requiredPeople > 0 
                    ? Math.round((shift.approved.length / shift.requiredPeople) * 100)
                    : 0
            };
        } catch (error) {
            console.error('Ошибка при получении деталей смены:', error);
            throw error;
        }
    }

    // Получение статистики по пользователям
    async getUserStats() {
        try {
            const shifts = await this.getAllShifts();
            const userStats = {};
            
            // Собираем статистику по всем пользователям
            for (const shift of shifts) {
                const allUsers = [
                    ...shift.signedUp.map(user => this.extractUserName(user)),
                    ...shift.pendingApproval.map(user => this.extractUserName(user)),
                    ...shift.approved.map(user => this.extractUserName(user))
                ];
                
                for (const userName of allUsers) {
                    if (!userStats[userName]) {
                        userStats[userName] = {
                            totalApplications: 0,
                            approvedApplications: 0,
                            pendingApplications: 0,
                            shifts: []
                        };
                    }
                    
                    userStats[userName].totalApplications++;
                    userStats[userName].shifts.push({
                        id: shift.id,
                        date: shift.date,
                        status: shift.approved.some(u => this.extractUserName(u) === userName) ? 'approved' : 
                               shift.pendingApproval.some(u => this.extractUserName(u) === userName) ? 'pending' : 'signed'
                    });
                    
                    if (shift.approved.some(u => this.extractUserName(u) === userName)) {
                        userStats[userName].approvedApplications++;
                    } else if (shift.pendingApproval.some(u => this.extractUserName(u) === userName)) {
                        userStats[userName].pendingApplications++;
                    }
                }
            }
            
            return userStats;
        } catch (error) {
            console.error('Ошибка при получении статистики пользователей:', error);
            return {};
        }
    }

    // Вспомогательные методы
    async debugTableStructure() {
        try {
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Подработки!A:I'
            });
            
            console.log('=== СТРУКТУРА ТАБЛИЦЫ ПОДРАБОТОК ===');
            console.log('Всего строк:', result.data.values.length);
            
            if (result.data.values.length > 0) {
                console.log('Заголовки:', result.data.values[0]);
                console.log('Первые 5 строк данных:');
                
                for (let i = 1; i <= Math.min(5, result.data.values.length - 1); i++) {
                    const row = result.data.values[i];
                    console.log(`Строка ${i + 1}:`, row);
                }
            }
            
            return result.data.values;
        } catch (error) {
            console.error('Ошибка при анализе структуры таблицы:', error);
            throw error;
        }
    }
}

module.exports = AdminService;