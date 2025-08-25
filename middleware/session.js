const LocalSession = require('telegraf-session-local');

const session = new LocalSession({
    property: 'session',
    storage: LocalSession.storageFileAsync,
    state: {
        userFio: null,
        userId: null,
        creatingShift: false,
        shiftData: {},
        adminAction: null,
        availableShifts: [],
        pendingApplications: [],
        currentData: null
    }
});

module.exports = session.middleware();