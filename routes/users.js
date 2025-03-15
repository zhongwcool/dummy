// routes/users.js
const express = require('express');
const router = express.Router();
const {verifyToken, checkRole} = require('../middleware/auth');
const {userDb} = require('../utils/fileHandler');

// 获取用户列表（需要 admin 权限）
router.get('/', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const users = await userDb.read();

        // 过滤敏感信息
        const sanitizedUsers = Object.entries(users).map(([username, user]) => ({
            username,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            created_at: user.created_at,
            last_login: user.last_login
        }));

        res.json({
            success: true,
            users: sanitizedUsers
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({
            success: false,
            message: '获取用户列表失败'
        });
    }
});

// 获取当前用户信息
router.get('/me', verifyToken, async (req, res) => {
    try {
        const users = await userDb.read();
        const user = users[req.user.username];

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        // 过滤敏感信息
        const userInfo = {
            username: req.user.username,
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            created_at: user.created_at,
            last_login: user.last_login
        };

        res.json({
            success: true,
            user: userInfo
        });
    } catch (error) {
        console.error('Error getting user info:', error);
        res.status(500).json({
            success: false,
            message: '获取用户信息失败'
        });
    }
});

module.exports = router;