const GoogleSheetsService = require('./google-sheets');

class ShiftService extends GoogleSheetsService {
    constructor() {
        super();
    }

    // Создание новой смены
    async createShift(shiftData) {
        try {
            console.log('📝 Создание новой смены:', shiftData);
            
            // Валидация данных
            if (!shiftData.date || !shiftData.time || !shiftData.department || !shiftData.requiredPeople) {
                throw new Error('Не все обязательные поля заполнены');
            }

            if (shiftData.requiredPeople <= 0) {
                throw new Error('Количество человек должно быть больше 0');
            }

            // Получаем текущие смены для генерации ID
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
                        '', // signedUp - колонка F
                        'active', // status - колонка G
                        '', // pendingApproval - колонка H
                        ''  // approved - колонка I
                    ]]
                }
            });
            
            console.log(`✅ Смена создана: ID ${newId}, ${shiftData.date} ${shiftData.time}, ${shiftData.department}`);
            return newId;
            
        } catch (error) {
            console.error('❌ Ошибка при создании смены:', error);
            throw error;
        }
    }

    // Получение смены по ID
    async getShiftById(shiftId) {
        try {
            const shifts = await this.getAvailableShifts();
            const shift = shifts.find(s => s.id.toString() === shiftId.toString());
            
            if (!shift) {
                throw new Error('Смена не найдена');
            }
            
            return shift;
        } catch (error) {
            console.error('❌ Ошибка при получении смены:', error);
            throw error;
        }
    }

    // Обновление смены
    async updateShift(shiftId, updateData) {
        try {
            const shifts = await this.getAvailableShifts();
            const shift = shifts.find(s => s.id.toString() === shiftId.toString());
            
            if (!shift) {
                throw new Error('Смена не найдена');
            }

            // Обновляем только переданные поля
            if (updateData.date !== undefined) shift.date = updateData.date;
            if (updateData.time !== undefined) shift.time = updateData.time;
            if (updateData.department !== undefined) shift.department = updateData.department;
            if (updateData.requiredPeople !== undefined) shift.requiredPeople = updateData.requiredPeople;
            if (updateData.status !== undefined) shift.status = updateData.status;

            await this.updateShiftInSheet(shiftId, {
                date: shift.date,
                time: shift.time,
                department: shift.department,
                requiredPeople: shift.requiredPeople,
                status: shift.status
            });
            
            console.log(`✅ Смена ${shiftId} обновлена`);
            return shift;
            
        } catch (error) {
            console.error('❌ Ошибка при обновлении смены:', error);
            throw error;
        }
    }

    // Обновление смены в таблице
    async updateShiftInSheet(shiftId, updates) {
        try {
            // Находим строку смены - используем родительский метод getValues
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

            // Записываем изменения - используем родительский метод updateValues
            await this.updateValues(range, [currentRow]);
            
            console.log(`✅ Смена ${shiftId} обновлена в таблице`);
            return true;

        } catch (error) {
            console.error('❌ Ошибка при обновлении смены в таблице:', error);
            throw error;
        }
    }

    // Изменение статуса смены
    async updateShiftStatus(shiftId, status) {
        try {
            const shift = await this.getShiftById(shiftId);
            
            if (!shift) {
                throw new Error('Смена не найдена');
            }
            
            await this.updateShiftInSheet(shiftId, { status });
            
            console.log(`✅ Статус смены ${shiftId} изменен на: ${status}`);
            return true;
        } catch (error) {
            console.error('❌ Ошибка при изменении статуса смены:', error);
            throw error;
        }
    }

    // Деактивация смены
    async deactivateShift(shiftId) {
        try {
            return await this.updateShiftStatus(shiftId, 'inactive');
        } catch (error) {
            console.error('❌ Ошибка при деактивации смены:', error);
            throw error;
        }
    }

    // Завершение смены
    async completeShift(shiftId) {
        try {
            return await this.updateShiftStatus(shiftId, 'completed');
        } catch (error) {
            console.error('❌ Ошибка при завершении смены:', error);
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
            console.error('❌ Ошибка при получении всех смен:', error);
            return [];
        }
    }

    // Получение смен по статусу
    async getShiftsByStatus(status) {
        try {
            const allShifts = await this.getAllShifts();
            return allShifts.filter(shift => shift.status === status);
        } catch (error) {
            console.error('❌ Ошибка при получении смен по статусу:', error);
            return [];
        }
    }

    // Получение активных смен
    async getActiveShifts() {
        return await this.getShiftsByStatus('active');
    }

    // Получение завершенных смен
    async getCompletedShifts() {
        return await this.getShiftsByStatus('completed');
    }

    // Получение неактивных смен
    async getInactiveShifts() {
        return await this.getShiftsByStatus('inactive');
    }

    // Получение детальной информации о смене
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
                    : 0,
                isFull: (shift.approved.length + shift.pendingApproval.length) >= shift.requiredPeople,
                canAcceptMore: (shift.approved.length + shift.pendingApproval.length) < shift.requiredPeople
            };
        } catch (error) {
            console.error('❌ Ошибка при получении деталей сменя:', error);
            throw error;
        }
    }

    // Запись пользователя на смену
    async signUpForShift(userId, userName, shiftId) {
        try {
            console.log(`📝 Попытка записи пользователя ${userName} на смену ${shiftId}`);
            
            const shift = await this.getShiftById(shiftId);
            
            if (!shift) {
                throw new Error('Смена не найдена');
            }
            
            if (shift.status !== 'active') {
                throw new Error('Смена не активна для записи');
            }
            
            const userWithId = `${userName}|${userId}`;
            
            // Проверяем, не подал ли уже заявку
            if (shift.pendingApproval.some(item => item.startsWith(userName + '|')) || 
                shift.approved.some(item => item.startsWith(userName + '|'))) {
                throw new Error('Вы уже подали заявку на эту смену');
            }
            
            // Проверяем, есть ли свободные места
            if ((shift.approved.length + shift.pendingApproval.length) >= shift.requiredPeople) {
                throw new Error('На эту смену уже набрано достаточно людей');
            }
            
            // Добавляем в ожидающие подтверждения
            const updatedPending = [...shift.pendingApproval, userWithId];
            await this.updateShiftInSheet(shiftId, { pendingApproval: updatedPending });
            
            console.log(`✅ Пользователь ${userName} добавлен в pendingApproval смены ${shiftId}`);
            return {
                success: true,
                shift: { ...shift, pendingApproval: updatedPending },
                availableSlots: shift.requiredPeople - (shift.approved.length + updatedPending.length)
            };
        } catch (error) {
            console.error('❌ Ошибка при записи на смену:', error);
            throw error;
        }
    }

    // Отмена записи на смену
    async cancelSignUp(userName, shiftId) {
        try {
            console.log(`❌ Отмена записи пользователя ${userName} с смены ${shiftId}`);
            
            const shift = await this.getShiftById(shiftId);
            
            if (!shift) {
                throw new Error('Смена не найдена');
            }
            
            // Удаляем из всех списков
            const updatedSignedUp = shift.signedUp.filter(item => !item.startsWith(userName + '|'));
            const updatedPending = shift.pendingApproval.filter(item => !item.startsWith(userName + '|'));
            const updatedApproved = shift.approved.filter(item => !item.startsWith(userName + '|'));
            
            await this.updateShiftInSheet(shiftId, {
                signedUp: updatedSignedUp,
                pendingApproval: updatedPending,
                approved: updatedApproved
            });
            
            console.log(`✅ Запись пользователя ${userName} отменена с смены ${shiftId}`);
            return true;
        } catch (error) {
            console.error('❌ Ошибка при отмене записи:', error);
            throw error;
        }
    }

    // Получение смен пользователя
    async getUserShifts(userName) {
        try {
            const allShifts = await this.getAllShifts();
            const userShifts = [];
            
            for (const shift of allShifts) {
                const userInSigned = shift.signedUp.some(item => this.extractUserName(item) === userName);
                const userInPending = shift.pendingApproval.some(item => this.extractUserName(item) === userName);
                const userInApproved = shift.approved.some(item => this.extractUserName(item) === userName);
                
                if (userInSigned || userInPending || userInApproved) {
                    userShifts.push({
                        ...shift,
                        userStatus: userInApproved ? 'approved' : 
                                  userInPending ? 'pending' : 'signed'
                    });
                }
            }
            
            return userShifts;
        } catch (error) {
            console.error('❌ Ошибка при получении смен пользователя:', error);
            return [];
        }
    }

    // Проверка, записан ли пользователь на смену
    async isUserSignedUp(userName, shiftId) {
        try {
            const shift = await this.getShiftById(shiftId);
            
            if (!shift) {
                return false;
            }
            
            return shift.signedUp.some(item => this.extractUserName(item) === userName) ||
                   shift.pendingApproval.some(item => this.extractUserName(item) === userName) ||
                   shift.approved.some(item => this.extractUserName(item) === userName);
        } catch (error) {
            console.error('❌ Ошибка при проверке записи пользователя:', error);
            return false;
        }
    }

    // Получение статистики по сменам
    async getShiftsStats() {
        try {
            const allShifts = await this.getAllShifts();
            const activeShifts = allShifts.filter(s => s.status === 'active');
            const completedShifts = allShifts.filter(s => s.status === 'completed');
            
            const stats = {
                total: allShifts.length,
                active: activeShifts.length,
                completed: completedShifts.length,
                inactive: allShifts.length - activeShifts.length - completedShifts.length,
                totalApplications: allShifts.reduce((acc, shift) => 
                    acc + shift.pendingApproval.length + shift.approved.length, 0),
                pendingApplications: allShifts.reduce((acc, shift) => 
                    acc + shift.pendingApproval.length, 0),
                approvedApplications: allShifts.reduce((acc, shift) => 
                    acc + shift.approved.length, 0),
                averageFulfillment: 0
            };
            
            // Расчет среднего процента заполнения
            const fulfilledShifts = allShifts.filter(shift => shift.requiredPeople > 0);
            if (fulfilledShifts.length > 0) {
                const totalFulfillment = fulfilledShifts.reduce((acc, shift) => 
                    acc + (shift.approved.length / shift.requiredPeople) * 100, 0);
                stats.averageFulfillment = Math.round(totalFulfillment / fulfilledShifts.length);
            }
            
            return stats;
        } catch (error) {
            console.error('❌ Ошибка при получении статистики смен:', error);
            return null;
        }
    }

    // Поиск смен по дате и отделу
    async findShiftsByCriteria(criteria) {
        try {
            const allShifts = await this.getAllShifts();
            
            return allShifts.filter(shift => {
                let matches = true;
                
                if (criteria.date && shift.date !== criteria.date) {
                    matches = false;
                }
                
                if (criteria.department && shift.department !== criteria.department) {
                    matches = false;
                }
                
                if (criteria.status && shift.status !== criteria.status) {
                    matches = false;
                }
                
                if (criteria.minSlots !== undefined) {
                    const availableSlots = shift.requiredPeople - (shift.approved.length + shift.pendingApproval.length);
                    if (availableSlots < criteria.minSlots) {
                        matches = false;
                    }
                }
                
                return matches;
            });
        } catch (error) {
            console.error('❌ Ошибка при поиске смен:', error);
            return [];
        }
    }

    // Валидация данных смены
    validateShiftData(shiftData) {
        const errors = [];
        
        if (!shiftData.date || !/^\d{2}\.\d{2}\.\d{4}$/.test(shiftData.date)) {
            errors.push('Неверный формат дата. Используйте ДД.ММ.ГГГГ');
        }
        
        if (!shiftData.time || !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(shiftData.time)) {
            errors.push('Неверный формат времени. Используйте ЧЧ:ММ-ЧЧ:ММ');
        }
        
        if (!shiftData.department || shiftData.department.trim().length < 2) {
            errors.push('Отдел должен содержать не менее 2 символов');
        }
        
        if (!shiftData.requiredPeople || shiftData.requiredPeople <= 0) {
            errors.push('Количество человек должно быть больше 0');
        }
        
        return errors;
    }

    // Форматирование смены для отображения
    formatShiftForDisplay(shift) {
        return {
            id: shift.id,
            date: shift.date,
            time: shift.time,
            department: shift.department,
            requiredPeople: shift.requiredPeople,
            approvedCount: shift.approved.length,
            pendingCount: shift.pendingApproval.length,
            availableSlots: shift.requiredPeople - (shift.approved.length + shift.pendingApproval.length),
            status: shift.status,
            isFull: (shift.approved.length + shift.pendingApproval.length) >= shift.requiredPeople,
            fulfillmentPercentage: shift.requiredPeople > 0 
                ? Math.round((shift.approved.length / shift.requiredPeople) * 100)
                : 0
        };
    }

    // Вспомогательные методы
    extractUserName(userString) {
        return userString.split('|')[0];
    }

    extractUserId(userString) {
        const parts = userString.split('|');
        return parts.length > 1 ? parseInt(parts[1]) : null;
    }
}

module.exports = ShiftService;