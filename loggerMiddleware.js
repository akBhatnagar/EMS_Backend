const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Create a write stream for logging requests
const accessLogStream = fs.createWriteStream(path.join(__dirname, './logs/server.log'), { flags: 'a' });

// Custom token for timestamp
morgan.token('date', () => {
    return new Date().toISOString();
});

// Use morgan middleware for logging requests
const requestLogger = morgan(':date :method :url :status :response-time ms', { stream: accessLogStream });

// Middleware for logging errors
const errorLogger = (err, req, res, next) => {
    logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
    next(err);
};

module.exports = { requestLogger, errorLogger };
