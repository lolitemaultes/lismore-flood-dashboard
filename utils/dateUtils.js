const { Logger } = require('./logger');

class DateUtils {
    static parseOutageDate(dateStr) {
        if (!dateStr || dateStr === '—' || dateStr === '' || dateStr.trim() === '') return null;
        
        try {
            const [datePart, timePart] = dateStr.trim().split(' ');
            if (!datePart) return null;
            
            const [day, month, year] = datePart.split('/');
            if (!day || !month || !year) return null;
            
            const [hour, minute, second] = (timePart || '00:00:00').split(':');
            
            const date = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour || 0),
                parseInt(minute || 0),
                parseInt(second || 0)
            );
            
            return isNaN(date.getTime()) ? null : date.toISOString();
        } catch (error) {
            Logger.verbose(`Failed to parse date: ${dateStr}`);
            return null;
        }
    }
}

module.exports = DateUtils;
