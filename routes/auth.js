// routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {verifyToken} = require("../middleware/auth");
const usersDb = require('../utils/usersDb');
require('dotenv').config();

// 登录路由
router.post('/login', async (req, res) => {
    try {
        const {username, password} = req.body;
        const user = usersDb.getUser(username);

        if (!user || typeof password !== 'string') {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: '用户名或密码错误'
            });
        }

        // 更新最后登录时间
        try {
            usersDb.touchLastLogin(user.username);
        } catch (error) {
            console.error('Error updating last login:', error);
        }

        // 生成 JWT token
        const token = jwt.sign(
            {
                userId: user.email,
                username: user.username,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '90d' // token 90d后过期
            }
        );

        res.json({
            success: true,
            token: token,
            userId: user.email,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            message: '登录成功'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误'
        });
    }
});

// 验证token是否有效
router.get('/verify-token', verifyToken, (req, res) => {
    res.json({
        valid: true,
        user: req.user
    });
});

// 登出路由
router.post('/logout', (req, res) => {
    // JWT 是无状态的，客户端只需要删除token即可
    res.json({
        success: true,
        message: '登出成功'
    });
});

module.exports = router;