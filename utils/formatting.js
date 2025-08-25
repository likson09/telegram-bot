function truncateName(fullName) {
    const parts = fullName.split(' ');
    if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
    if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`;
    return fullName.slice(0, 10);
}

function formatDateShort(dateStr) {
    return dateStr.split('.')[0] + '.' + dateStr.split('.')[1];
}

function formatTime(timeStr) {
    return timeStr.split('-')[0];
}

module.exports = { truncateName, formatDateShort, formatTime };