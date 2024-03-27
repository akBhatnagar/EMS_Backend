const { createLogger, transports, format } = require('winston');
const { combine, timestamp, printf } = format;

// Define log format
const logFormat = printf(({ timestamp, level, message }) => {
    return `${timestamp} ${level}: ${message}`;
});

// Create a logger instance
const logger = createLogger({
    format: combine(timestamp(), logFormat),
    transports: [
        new transports.File({ filename: './logs/server.log' }), // Log to a file
        new transports.Console() // Log to console as well
    ]
});

module.exports = logger;
