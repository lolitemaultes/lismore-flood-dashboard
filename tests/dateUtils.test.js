const assert = require('assert');
const DateUtils = require('../utils/dateUtils');

describe('DateUtils', function() {
    describe('parseOutageDate', function() {
        it('should return null for empty or invalid strings', function() {
            assert.strictEqual(DateUtils.parseOutageDate(null), null);
            assert.strictEqual(DateUtils.parseOutageDate(''), null);
            assert.strictEqual(DateUtils.parseOutageDate('—'), null);
            assert.strictEqual(DateUtils.parseOutageDate('   '), null);
        });

        it('should parse a valid date string "DD/MM/YYYY HH:mm:ss"', function() {
            const dateStr = '28/11/2025 14:30:00';
            const expected = new Date(2025, 10, 28, 14, 30, 0).toISOString();
            assert.strictEqual(DateUtils.parseOutageDate(dateStr), expected);
        });

        it('should default to 00:00:00 if time is missing', function() {
            // Current implementation requires space split but handles missing time part in logic potentially?
            // Let's check implementation: const [datePart, timePart] = dateStr.trim().split(' ');
            // if timePart is undefined, [hour, minute, second] will be derived from '00:00:00'.
            const dateStr = '28/11/2025';
            const expected = new Date(2025, 10, 28, 0, 0, 0).toISOString();
            assert.strictEqual(DateUtils.parseOutageDate(dateStr), expected);
        });
    });
});
