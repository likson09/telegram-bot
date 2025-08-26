const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

class GoogleSheetsService {
    constructor() {
        this.client = null;
        this.spreadsheetId = process.env.SPREADSHEET_ID;
        this.SUPER_ADMIN_ID = parseInt(process.env.SUPER_ADMIN_ID) || 566632489;
    }
    // Добавьте этот метод в класс GoogleSheetsService
async isAdmin(userId) {
    try {
        console.log(`🔍 Проверка прав администратора для пользователя: ${userId}`);
        
        // Проверка на супер-админа
        if (userId === this.SUPER_ADMIN_ID) {
            console.log('✅ Пользователь является супер-администратором');
            return true;
        }
        
        // Проверка в списке админов из Google Sheets
        const adminRanges = ['Админы!A:A', 'Администраторы!A:A', 'Admin!A:A'];
        
        for (const range of adminRanges) {
            try {
                const rows = await this.getValues(range);
                const isAdmin = rows.some(row => 
                    row.some(cell => {
                        const cellValue = cell?.toString().trim();
                        if (!cellValue) return false;
                        
                        // Проверка по ID (если в ячейке формат "имя|id")
                        if (cellValue.includes('|')) {
                            const idPart = cellValue.split('|')[1];
                            return idPart && parseInt(idPart.trim()) === userId;
                        }
                        
                        // Проверка по чистому ID
                        return parseInt(cellValue) === userId;
                    })
                );
                
                if (isAdmin) {
                    console.log(`✅ Пользователь найден в списке администраторов: ${range}`);
                    return true;
                }
            } catch (error) {
                console.warn(`⚠️ Ошибка при проверке диапазона ${range}:`, error.message);
                continue;
            }
        }
        
        console.log(`❌ Пользователь не является администратором: ${userId}`);
        return false;
        
    } catch (error) {
        console.error('❌ Ошибка при проверке прав администратора:', error.message);
        return false;
    }
}

    async connect() {
        try {
            console.log('🔗 Подключение к Google Sheets...');
            
            const credentials = await this.loadCredentials();
            
            const auth = new google.auth.JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: ['https://www.googleapis.com/auth/spreadsheets'],
            });

            await auth.authorize();
            this.client = google.sheets({ version: 'v4', auth });
            
            console.log('✅ Подключение к Google Sheets успешно');
            return this.client;
            
        } catch (error) {
            console.error('❌ Ошибка подключения к Google Sheets:', error.message);
            throw error;
        }
    }

    async loadCredentials() {
        try {
            const credentialsEnv = process.env.GOOGLE_CREDENTIALS;
            
            if (!credentialsEnv) {
                throw new Error('GOOGLE_CREDENTIALS not found in environment variables');
            }

            const trimmedCredentials = credentialsEnv.trim();

            // Если это путь к файлу (оканчивается на .json)
            if (trimmedCredentials.endsWith('.json')) {
                return await this.loadCredentialsFromFile(trimmedCredentials);
            }

            // Если это JSON строка
            try {
                return JSON.parse(trimmedCredentials);
            } catch (parseError) {
                throw new Error('GOOGLE_CREDENTIALS is not valid JSON: ' + parseError.message);
            }
            
        } catch (error) {
            console.error('❌ Error loading Google credentials:', error.message);
            throw error;
        }
    }

    async loadCredentialsFromFile(filePath) {
        try {
            const resolvedPath = path.resolve(filePath);
            console.log(`📁 Загрузка credentials из файла: ${resolvedPath}`);
            
            const data = await fs.readFile(resolvedPath, 'utf8');
            const credentials = JSON.parse(data);
            
            // Валидация обязательных полей
            if (!credentials.client_email) {
                throw new Error('Credentials file missing client_email');
            }
            if (!credentials.private_key) {
                throw new Error('Credentials file missing private_key');
            }
            
            console.log('✅ Credentials успешно загружены из файла');
            return credentials;
            
        } catch (error) {
            console.error('❌ Error reading credentials file:', error.message);
            throw new Error('Failed to read credentials file: ' + error.message);
        }
    }

    // Базовые методы для работы с таблицами
    async getValues(range) {
        try {
            if (!this.client) {
                await this.connect();
            }

            const result = await this.client.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });
            return result.data.values || [];
        } catch (error) {
            console.error('Ошибка при получении данных:', error);
            throw new Error('Не удалось получить данные из таблицы');
        }
    }

    async updateValues(range, values) {
        try {
            if (!this.client) {
                await this.connect();
            }

            await this.client.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values }
            });
        } catch (error) {
            console.error('Ошибка при обновлении данных:', error);
            throw error;
        }
    }

    async appendValues(range, values) {
        try {
            if (!this.client) {
                await this.connect();
            }

            await this.client.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values }
            });
        } catch (error) {
            console.error('Ошибка при добавлении данных:', error);
            throw error;
        }
    }

    // Функции для работы со сменами
    async getAvailableShifts() {
        try {
            console.log('🔄 Загрузка смен из таблицы "Подработки"...');
            
            const rows = await this.getValues('Подработки!A:I');
            
            if (rows.length < 2) {
                console.log('⚠️ В таблице нет данных или только заголовки');
                return [];
            }
            
            const shifts = [];
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                
                if (!row || row.length === 0) continue;
                if (row.length < 4 || !row[1] || !row[3]) continue;
                
                try {
                    const shift = {
                        id: (row[0]?.toString() || (i).toString()).trim(),
                        date: (row[1]?.toString() || 'Не указана').trim(),
                        time: (row[2]?.toString() || 'Не указано').trim(),
                        department: (row[3]?.toString() || 'Не указан').trim(),
                        requiredPeople: 0,
                        signedUp: [],
                        status: 'active',
                        pendingApproval: [],
                        approved: []
                    };
                    
                    if (row[4] !== undefined && row[4] !== null && row[4] !== '') {
                        shift.requiredPeople = parseInt(row[4].toString().trim());
                        if (isNaN(shift.requiredPeople) || shift.requiredPeople < 0) {
                            shift.requiredPeople = 0;
                        }
                    }
                    
                    if (row[6] !== undefined && row[6] !== null) {
                        const status = row[6].toString().trim().toLowerCase();
                        shift.status = (status === 'active' || status === 'активно') ? 'active' : 
                                      (status === 'inactive' || status === 'неактивно') ? 'inactive' : 
                                      (status === 'completed' || status === 'завершено') ? 'completed' : 'active';
                    }
                    
                    const processUserList = (listString) => {
                        if (!listString) return [];
                        return listString.toString()
                            .split(',')
                            .map(name => name.trim())
                            .filter(name => name.length > 0);
                    };
                    
                    if (row[5]) shift.signedUp = processUserList(row[5]);
                    if (row[7]) shift.pendingApproval = processUserList(row[7]);
                    if (row[8]) shift.approved = processUserList(row[8]);
                    
                    if (shift.status === 'active') {
                        shifts.push(shift);
                    }
                    
                } catch (rowError) {
                    console.error(`❌ Ошибка обработки строки ${i + 1}:`, rowError);
                }
            }
            
            console.log(`✅ Загружено ${shifts.length} активных смен`);
            return shifts;
            
        } catch (error) {
            console.error('❌ Ошибка при получении смен:', error);
            return [];
        }
    }

    // Функции для проверки сотрудников
    async checkEmployeeExists(fio) {
        try {
            console.log(`🔍 Проверка наличия сотрудника: ${fio}`);
            
            const tablesToCheck = ['Ошибки!A:A', 'Табель!A:Z', 'Отбор!A:A', 'Размещение!A:A'];
            
            for (const range of tablesToCheck) {
                try {
                    const rows = await this.getValues(range);
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
            
            console.log(`❌ Сотрудник не найден ни в одной таблице: ${fio}`);
            return false;
            
        } catch (error) {
            console.error('❌ Ошибка при проверке сотрудника:', error.message);
            return false; // Возвращаем false вместо ошибки
        }
    }

    // Функции для пользователей
    async getErrorCount(fio) {
        try {
            const rows = await this.getValues('Ошибки!A:C');
            const errors = rows.filter(row => row[0] && row[0].toString().trim() === fio.trim());
            return errors.length;
        } catch (error) {
            console.error('Ошибка при получении ошибок:', error);
            return 0; // Возвращаем 0 вместо ошибки
        }
    }

    // Вспомогательные функции
    parseDate(dateString) {
        if (!dateString) return new Date(0);
        
        const formats = [
            /(\d{2})\.(\d{2})\.(\d{4})/,
            /(\d{4})-(\d{2})-(\d{2})/,
            /(\d{1,2})\/(\d{1,2})\/(\d{4})/
        ];
        
        for (const format of formats) {
            const match = dateString.match(format);
            if (match) {
                let day, month, year;
                
                if (format === formats[0]) {
                    day = parseInt(match[1]);
                    month = parseInt(match[2]) - 1;
                    year = parseInt(match[3]);
                } else if (format === formats[1]) {
                    year = parseInt(match[1]);
                    month = parseInt(match[2]) - 1;
                    day = parseInt(match[3]);
                } else {
                    month = parseInt(match[1]) - 1;
                    day = parseInt(match[2]);
                    year = parseInt(match[3]);
                }
                
                return new Date(year, month, day);
            }
        }
        
        return new Date(0);
    }

    extractUserName(userString) {
        return userString.split('|')[0];
    }

    extractUserId(userString) {
        const parts = userString.split('|');
        return parts.length > 1 ? parseInt(parts[1]) : null;
    }

    // Метод для тестирования подключения
    async testConnection() {
        try {
            if (!this.client) {
                await this.connect();
            }

            // Простая проверка - получаем информацию о таблице
            const response = await this.client.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            console.log('✅ Подключение к Google Sheets работает');
            console.log(`📊 Таблица: ${response.data.properties.title}`);
            return true;
            
        } catch (error) {
            console.error('❌ Ошибка тестирования подключения:', error.message);
            return false;
        }
    }
}

module.exports = GoogleSheetsService;