const assert = require('assert');
const FloodService = require('../services/floodService');

describe('FloodService', function() {
    describe('determineFloodCategory', function() {
        const location = "Wilsons R at Lismore (mAHD)";
        
        it('should return "No flooding" for levels below minor', function() {
            assert.strictEqual(FloodService.determineFloodCategory(2.0, location), 'No flooding');
            assert.strictEqual(FloodService.determineFloodCategory(4.19, location), 'No flooding');
        });

        it('should return "Minor" for levels between minor and moderate', function() {
            assert.strictEqual(FloodService.determineFloodCategory(4.20, location), 'Minor');
            assert.strictEqual(FloodService.determineFloodCategory(5.0, location), 'Minor');
            assert.strictEqual(FloodService.determineFloodCategory(7.19, location), 'Minor');
        });

        it('should return "Moderate" for levels between moderate and major', function() {
            assert.strictEqual(FloodService.determineFloodCategory(7.20, location), 'Moderate');
            assert.strictEqual(FloodService.determineFloodCategory(8.5, location), 'Moderate');
            assert.strictEqual(FloodService.determineFloodCategory(9.69, location), 'Moderate');
        });

        it('should return "Major" for levels above major', function() {
            assert.strictEqual(FloodService.determineFloodCategory(9.70, location), 'Major');
            assert.strictEqual(FloodService.determineFloodCategory(12.0, location), 'Major');
        });

        it('should return "N/A" for unknown locations', function() {
            assert.strictEqual(FloodService.determineFloodCategory(5.0, "Unknown Location"), 'N/A');
        });

        it('should return "Unknown" if level is null', function() {
            assert.strictEqual(FloodService.determineFloodCategory(null, location), 'Unknown');
        });
    });
});
