const GoogleSheetsService = require('./google-sheets');

class UserService extends GoogleSheetsService {
    constructor() {
        super();
    }

    // Сохранение/обновление пользователя
    async saveUser(fio, userId) {
        try {
            console.log(`💾 Сохранение пользователя: ${fio} (ID: ${userId})`);
            
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A:B'
            });
            
            const rows = result.data.values || [];
            let rowIndex = -1;
            
            // Ищем пользователя
            for (let i = 0; i < rows.length; i++) {
                if (rows[i][0] && rows[i][0].trim() === fio.trim()) {
                    rowIndex = i + 1;
                    break;
                }
            }
            
            if (rowIndex === -1) {
                // Добавляем нового пользователя
                await this.client.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Пользователи!A:B',
                    valueInputOption: 'RAW',
                    resource: {
                        values: [[fio, userId]]
                    }
                });
                console.log(`✅ Пользователь добавлен: ${fio}`);
            } else {
                // Обновляем существующего пользователя
                await this.client.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Пользователи!B${rowIndex}`,
                    valueInputOption: 'RAW',
                    resource: {
                        values: [[userId]]
                    }
                });
                console.log(`✅ ID пользователя обновлен: ${fio}`);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Ошибка при сохранении пользователя:', error);
            return false;
        }
    }

    // Поиск ID пользователя по ФИО
    async findUserIdByFio(fio) {
        try {
            console.log(`🔍 Поиск ID пользователя по ФИО: ${fio}`);
            
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A:B'
            });
            
            const rows = result.data.values || [];
            
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0] && rows[i][0].trim() === fio.trim() && rows[i][1]) {
                    const userId = parseInt(rows[i][1]);
                    console.log(`✅ ID найден: ${fio} → ${userId}`);
                    return userId;
                }
            }
            
            console.log(`⚠️ ID не найден для: ${fio}`);
            return null;
            
        } catch (error) {
            console.error('❌ Ошибка при поиске ID пользователя:', error);
            return null;
        }
    }

    // Поиск ФИО по ID пользователя
    async findFioByUserId(userId) {
        try {
            console.log(`🔍 Поиск ФИО по ID: ${userId}`);
            
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A:B'
            });
            
            const rows = result.data.values || [];
            
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][1] && parseInt(rows[i][1]) === userId && rows[i][0]) {
                    const fio = rows[i][0].trim();
                    console.log(`✅ ФИО найдено: ${userId} → ${fio}`);
                    return fio;
                }
            }
            
            console.log(`⚠️ ФИО не найдено для ID: ${userId}`);
            return null;
            
        } catch (error) {
            console.error('❌ Ошибка при поиске ФИО:', error);
            return null;
        }
    }

    // Получение всех пользователей
    async getAllUsers() {
        try {
            console.log('📋 Получение списка всех пользователей');
            
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A:B'
            });
            
            const rows = result.data.values || [];
            const users = [];
            
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0] && rows[i][1]) {
                    users.push({
                        fio: rows[i][0].trim(),
                        userId: parseInt(rows[i][1]),
                        rowIndex: i + 1
                    });
                }
            }
            
            console.log(`✅ Найдено пользователей: ${users.length}`);
            return users;
            
        } catch (error) {
            console.error('❌ Ошибка при получении пользователей:', error);
            return [];
        }
    }

    // Удаление пользователя
    async deleteUser(fio) {
        try {
            console.log(`🗑️ Удаление пользователя: ${fio}`);
            
            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A:B'
            });
            
            const rows = result.data.values || [];
            const updatedRows = rows.filter((row, index) => {
                if (index === 0) return true; // Заголовок
                return !(row[0] && row[0].trim() === fio.trim());
            });
            
            await this.client.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Пользователи!A:B',
                valueInputOption: 'RAW',
                resource: {
                    values: updatedRows
                }
            });
            
            console.log(`✅ Пользователь удален: ${fio}`);
            return true;
            
        } catch (error) {
            console.error('❌ Ошибка при удалении пользователя:', error);
            throw error;
        }
    }

    // Проверка существования сотрудника в системе
    async checkEmployeeExists(fio) {
        try {
            console.log(`🔍 Проверка наличия сотрудника в системе: ${fio}`);
            
            const tablesToCheck = ['Ошибки!A:A', 'Табель!A:Z', 'Отбор!A:A', 'Размещение!A:A'];
            
            for (const range of tablesToCheck) {
                try {
                    const result = await this.client.spreadsheets.values.get({
                        spreadsheetId: this.spreadsheetId,
                        range: range
                    });
                    
                    const rows = result.data.values || [];
                    const found = rows.some(row => row.some(cell => cell && cell.toString().trim() === fio.trim()));
                    
                    if (found) {
                        console.log(`✅ Сотрудник найден в таблице: ${range.split('!')[0]}`);
                        return true;
                    }
                } catch (error) {
                    console.warn(`⚠️ Ошибка при проверке таблицы ${range}:`, error.message);
                    continue;
                }
            }
            
            console.log(`❌ Сотрудник не найден в системе: ${fio}`);
            return false;
            
        } catch (error) {
            console.error('❌ Ошибка при проверке сотрудника:', error.message);
            throw new Error('Ошибка при проверке данных таблиц');
        }
    }

    // Получение количества ошибок сотрудника
    async getErrorCount(fio) {
        try {
            console.log(`📊 Получение количества ошибок для: ${fio}`);
            
            const rows = await this.getValues('Ошибки!A:C');
            const errors = rows.filter(row => row[0] && row[0].trim() === fio.trim());
            
            console.log(`✅ Найдено ошибок: ${errors.length} для ${fio}`);
            return errors.length;
            
        } catch (error) {
            console.error('❌ Ошибка при получении ошибок:', error);
            throw new Error('Не удалось получить данные об ошибках');
        }
    }

    // Получение данных табеля сотрудника
    async getShiftData(fio) {
        try {
            console.log(`📅 Получение данных табеля для: ${fio}`);
            
            const rows = await this.getValues('Табель!A:Z');
            
            if (!rows || rows.length < 2) {
                throw new Error('Данные табеля не найдены');
            }

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                for (let j = 0; j < Math.min(row.length, 10); j++) {
                    if (row[j] && row[j].toString().trim() === fio.trim()) {
                        const data = {
                            plannedShifts: parseInt(row[0] || 0),
                            extraShifts: parseInt(row[1] || 0),
                            absences: parseInt(row[2] || 0),
                            reinforcementShifts: parseInt(row[3] || 0)
                        };
                        console.log(`✅ Данные табеля получены для: ${fio}`, data);
                        return data;
                    }
                }
            }
            
            throw new Error('Сотрудник не найден в табеле');
            
        } catch (error) {
            console.error('❌ Ошибка при получении данных табеля:', error);
            throw new Error('Не удалось получить данные табеля');
        }
    }

    // Получение данных производительности (отбор)
    async getSelectionData(fio, year, month) {
        try {
            console.log(`📦 Получение данных отбора для: ${fio}, ${month}.${year}`);
            
            const rows = await this.getValues('Отбор!A:D');
            
            if (!rows || rows.length < 2) {
                console.log('❌ Данные отбора не найдены или пустые');
                return {};
            }
            
            const data = {};
            
            // Инициализируем дни
            for (let day = 1; day <= 31; day++) {
                data[`rm_day_${day}`] = 0;
                data[`os_day_${day}`] = 0;
            }
            
            const filteredData = rows.filter(row => {
                if (row.length < 4) return false;
                
                try {
                    const rowDate = new Date(row[1]);
                    return row[0] && row[0].trim() === fio.trim() && 
                           rowDate.getFullYear() === year && 
                           rowDate.getMonth() + 1 === month;
                } catch (error) {
                    console.log('❌ Ошибка парсинга даты:', error);
                    return false;
                }
            });
            
            filteredData.forEach(row => {
                try {
                    const day = new Date(row[1]).getDate();
                    const os = parseFloat(row[2]) || 0;
                    const rm = parseFloat(row[3]) || 0;
                    
                    data[`rm_day_${day}`] = rm;
                    data[`os_day_${day}`] = os;
                } catch (error) {
                    console.log('❌ Ошибка обработки строки отбора:', error);
                }
            });
            
            console.log(`✅ Данные отбора получены для: ${fio}`);
            return data;
            
        } catch (error) {
            console.error('❌ Ошибка при получении данных отбора:', error.message);
            return {};
        }
    }

    // Получение данных производительности (размещение)
    async getPlacementData(fio, year, month) {
        try {
            console.log(`📋 Получение данных размещения для: ${fio}, ${month}.${year}`);
            
            const rows = await this.getValues('Размещение!A:D');
            
            if (!rows) {
                throw new Error('Данные размещения не найдены');
            }
            
            const data = {};
            
            for (let day = 1; day <= 31; day++) {
                data[`rm_day_${day}`] = 0;
                data[`os_day_${day}`] = 0;
            }
            
            const filteredData = rows.filter(row => {
                if (row.length < 4) return false;
                
                const rowDate = new Date(row[1]);
                return row[0] && row[0].trim() === fio.trim() && 
                       rowDate.getFullYear() === year && 
                       rowDate.getMonth() + 1 === month;
            });
            
            filteredData.forEach(row => {
                const day = new Date(row[1]).getDate();
                const os = parseFloat(row[2]) || 0;
                const rm = parseFloat(row[3]) || 0;
                
                data[`rm_day_${day}`] = rm;
                data[`os_day_${day}`] = os;
            });
            
            console.log(`✅ Данные размещения получены для: ${fio}`);
            return data;
            
        } catch (error) {
            console.error('❌ Ошибка при получении данных размещения:', error.message);
            throw new Error('Не удалось получить данные размещения');
        }
    }

    // Получение общей производительности
    async getProductivityData(fio, year, month) {
        try {
            console.log(`📈 Получение данных производительности для: ${fio}, ${month}.${year}`);
            
            const selectionData = await this.getSelectionData(fio, year, month);
            const placementData = await this.getPlacementData(fio, year, month);

            let totalRmSelection = 0;
            let totalOsSelection = 0;
            let totalRmPlacement = 0;
            let totalOsPlacement = 0;
            let daysWithData = 0;

            for (let day = 1; day <= 31; day++) {
                const selRm = selectionData ? (selectionData[`rm_day_${day}`] || 0) : 0;
                const selOs = selectionData ? (selectionData[`os_day_${day}`] || 0) : 0;
                const plRm = placementData ? (placementData[`rm_day_${day}`] || 0) : 0;
                const plOs = placementData ? (placementData[`os_day_${day}`] || 0) : 0;
                
                if (selRm > 0 || selOs > 0 || plRm > 0 || plOs > 0) {
                    daysWithData++;
                    totalRmSelection += selRm;
                    totalOsSelection += selOs;
                    totalRmPlacement += plRm;
                    totalOsPlacement += plOs;
                }
            }

            const result = {
                selectionData,
                placementData,
                totalRmSelection,
                totalOsSelection,
                totalRmPlacement,
                totalOsPlacement,
                daysWithData,
                totalSelection: totalRmSelection + totalOsSelection,
                totalPlacement: totalRmPlacement + totalOsPlacement,
                avgSelectionPerDay: daysWithData > 0 ? Math.round((totalRmSelection + totalOsSelection) / daysWithData) : 0,
                avgPlacementPerDay: daysWithData > 0 ? Math.round((totalRmPlacement + totalOsPlacement) / daysWithData) : 0
            };

            console.log(`✅ Данные производительности получены для: ${fio}`, {
                daysWithData: result.daysWithData,
                totalSelection: result.totalSelection,
                totalPlacement: result.totalPlacement
            });
            
            return result;
            
        } catch (error) {
            console.error('❌ Ошибка при получении данных производительности:', error);
            return {
                selectionData: {},
                placementData: {},
                totalRmSelection: 0,
                totalOsSelection: 0,
                totalRmPlacement: 0,
                totalOsPlacement: 0,
                daysWithData: 0,
                totalSelection: 0,
                totalPlacement: 0,
                avgSelectionPerDay: 0,
                avgPlacementPerDay: 0
            };
        }
    }

    // Получение заявок пользователя на подработку
    async getUserApplications(userName) {
        try {
            console.log(`📝 Получение заявок пользователя: ${userName}`);
            
            const shifts = await this.getAvailableShifts();
            const userApplications = shifts.filter(shift => 
                shift.signedUp.some(item => this.extractUserName(item) === userName) || 
                shift.pendingApproval.some(item => this.extractUserName(item) === userName) || 
                shift.approved.some(item => this.extractUserName(item) === userName)
            );
            
            console.log(`✅ Найдено заявок: ${userApplications.length} для ${userName}`);
            return userApplications;
        } catch (error) {
            console.error('❌ Ошибка при получении заявок:', error);
            return [];
        }
    }

    // Получение статистики пользователя
    async getUserStats(fio) {
        try {
            console.log(`📊 Получение статистики пользователя: ${fio}`);
            
            const [errorCount, shiftData, applications] = await Promise.all([
                this.getErrorCount(fio),
                this.getShiftData(fio),
                this.getUserApplications(fio)
            ]);
            
            const stats = {
                errorCount,
                shiftData,
                applicationsCount: applications.length,
                approvedApplications: applications.filter(app => 
                    app.approved.some(item => this.extractUserName(item) === fio)
                ).length,
                pendingApplications: applications.filter(app => 
                    app.pendingApproval.some(item => this.extractUserName(item) === fio)
                ).length
            };
            
            console.log(`✅ Статистика получена для: ${fio}`, stats);
            return stats;
            
        } catch (error) {
            console.error('❌ Ошибка при получении статистики пользователя:', error);
            return {
                errorCount: 0,
                shiftData: {},
                applicationsCount: 0,
                approvedApplications: 0,
                pendingApplications: 0
            };
        }
    }

    // Валидация ФИО
    validateFIO(fio) {
        const parts = fio.trim().replace(/\s+/g, ' ').split(' ');
        const isValid = parts.length === 3 && parts.every(part => /^[A-Za-zА-Яа-яЁё\-]+$/.test(part));
        
        if (!isValid) {
            console.log(`❌ Невалидное ФИО: ${fio}`);
        }
        
        return isValid;
    }

    // Форматирование ФИО
    formatFIO(fio) {
        if (!fio) return '';
        
        const parts = fio.trim().split(' ');
        if (parts.length === 3) {
            return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
        }
        if (parts.length === 2) {
            return `${parts[0]} ${parts[1][0]}.`;
        }
        return fio;
    }

    // Сокращение ФИО
    truncateName(fullName, maxLength = 15) {
        if (!fullName) return '???';
        
        const parts = fullName.split(' ');
        if (parts.length >= 3) {
            return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
        }
        if (parts.length === 2) {
            return `${parts[0]} ${parts[1][0]}.`;
        }
        return fullName.length > maxLength ? fullName.slice(0, maxLength - 1) + '…' : fullName;
    }
}

module.exports = UserService;