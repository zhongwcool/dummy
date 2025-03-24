const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// 验证 JWT Token 的中间件
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '未提供认证token'
        });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        // 详细记录错误到日志文件
        logger.error('Token验证失败', {
            errorName: error.name,
            errorMessage: error.message,
            requestPath: req.path,
            requestIP: req.ip,
            requestMethod: req.method,
            requestHeaders: req.headers,
            userAgent: req.get('User-Agent')
        });

        let message = 'token无效或已过期';
        if (error.name === 'TokenExpiredError') {
            message = 'token已过期，请重新登录';
        } else if (error.name === 'JsonWebTokenError') {
            message = 'token无效，请重新登录';
        } else if (error.name === 'NotBeforeError') {
            message = 'token尚未激活';
        }
        
        return res.status(401).json({
            success: false,
            message
        });
    }
};

// 检查用户角色的中间件
const checkRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: '权限不足'
            });
        }
        next();
    };
};

module.exports = {
    verifyToken,
    checkRole
}; 