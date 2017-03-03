const env = process.env.BACKUP_ENV || 'default';

module.exports = require('../config.' + env);
