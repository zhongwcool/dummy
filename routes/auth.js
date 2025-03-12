// routes/auth.js
const express = require('express');
const router = express.Router();

// 登录路由
router.post('/login', (req, res) => {
    const {username, password} = req.body;
    if (username === 'admin' && password === '123456') {
        res.json({
            success: true,
            token: 'fake-jwt-token',
            userId: 'zhongwcool@163.com',
            username: 'admin',
            displayName: '大魔王',
            message: 'Login successful'
        });
    } else {
        res.status(401).json({success: false, message: 'Invalid credentials'});
    }
});

// 验证token是否有效
router.get('/verify-token', (req, res) => {
    const token = req.headers['authorization'];
    if (token && token === 'fake-jwt-token') {
        res.json({valid: true});
    } else {
        res.status(401).json({valid: false, message: 'Invalid token'});
    }
});

// 登出路由
router.post('/logout', (req, res) => {
    res.json({success: true, message: 'Logged out successfully'});
});

module.exports = router;