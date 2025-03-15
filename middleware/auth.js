const jwt = require('jsonwebtoken');

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
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'token无效或已过期'
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