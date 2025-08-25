function validateFIO(fio) {
    const parts = fio.trim().replace(/\s+/g, ' ').split(' ');
    return parts.length >= 2 && parts.every(p => /^[A-Za-zА-Яа-яЁё\-]+$/.test(p));
}

function isValidDate(dateStr) {
    return /^\d{2}\.\d{2}\.\d{4}$/.test(dateStr);
}

function isValidTime(timeStr) {
    return /^\d{2}:\d{2}-\d{2}:\d{2}$/.test(timeStr);
}

module.exports = { validateFIO, isValidDate, isValidTime };