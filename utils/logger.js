const winston = require('winston');
const path = require('path');
const fs = require('fs');

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, {recursive: true});
}

// 创建一个自定义的日期格式，用于日志文件名
const dateFormat = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
};

// 创建一个格式化器
const customFormat = winston.format.combine(
    winston.format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
    winston.format.printf(info => {
        return `[${info.timestamp}] [${info.level.toUpperCase()}]: ${info.message} ${
            info.data ? JSON.stringify(info.data, null, 2) : ''
        }`;
    })
);

// 创建日志记录器
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: customFormat,
    transports: [
        // 控制台输出
        new winston.transports.Console(),

        // 按天存储日志文件
        new winston.transports.File({
            filename: path.join(logDir, `${dateFormat()}.log`),
            maxsize: 5242880, // 5MB
            maxFiles: 30,
        }),

        // 单独存储错误日志
        new winston.transports.File({
            filename: path.join(logDir, `${dateFormat()}-error.log`),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 30,
        })
    ]
});

// 每天凌晨更新日志文件
const updateLogFile = () => {
    const date = dateFormat();
    logger.transports.forEach(transport => {
        if (transport instanceof winston.transports.File) {
            // 为错误日志设置新的文件名
            if (transport.level === 'error') {
                transport.filename = path.join(logDir, `${date}-error.log`);
            }
            // 为普通日志设置新的文件名
            else {
                transport.filename = path.join(logDir, `${date}.log`);
            }
        }
    });
};

// 设置定时任务，每天凌晨00:01更新日志文件
const scheduleNextUpdate = () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0);
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();

    setTimeout(() => {
        updateLogFile();
        scheduleNextUpdate(); // 设置下一天的计时器
    }, timeUntilMidnight);
};

// 启动日志文件更新定时任务
scheduleNextUpdate();

module.exports = {
    error: (message, data) => logger.error(message, {data}),
    warn: (message, data) => logger.warn(message, {data}),
    info: (message, data) => logger.info(message, {data}),
    debug: (message, data) => logger.debug(message, {data})
}; 