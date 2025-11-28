const fs = require('fs');
const path = require('path');
const { Logger } = require('./logger');
const { Config } = require('../config/config');

class FileUtils {
    static async ensureDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            await fs.promises.mkdir(dirPath, { recursive: true });
            Logger.verbose(`Created directory: ${dirPath}`);
        }
    }
    
    static async cleanupRadarImages() {
        try {
            const dir = Config.paths.RESOURCES_DIR;
            if (!fs.existsSync(dir)) return;
            
            const files = await fs.promises.readdir(dir);
            let deletedCount = 0;
            
            for (const file of files) {
                if (file.startsWith('radar_') || file.match(/IDR[0-9]{3}\.(background|topography|locations|range)\.png$/)) {
                    const filePath = path.join(dir, file);
                    await fs.promises.unlink(filePath);
                    deletedCount++;
                }
            }
            
            if (deletedCount > 0) {
                Logger.verbose(`Cleaned ${deletedCount} old radar images`);
            }
        } catch (error) {
            Logger.error('Error cleaning radar images:', error.message);
        }
    }
}

module.exports = FileUtils;
