// routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const {verifyToken} = require("../middleware/auth");
require('dotenv').config();

// 用户数据文件路径
const USERS_FILE = path.join(__dirname, '../data/users.json');

// 读取用户数据
async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading users file:', error);
        return {};
    }
}

// 保存用户数据
async function saveUsers(users) {
    try {
        await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 4));
        return true;
    } catch (error) {
        console.error('Error saving users file:', error);
        return false;
    }
}

// 更新用户最后登录时间
async function updateLastLogin(username) {
    try {
        const users = await readUsers();
        if (users[username]) {
            users[username].last_login = new Date().toISOString();
            await saveUsers(users);
        }
    } catch (error) {
        console.error('Error updating last login:', error);
    }
}

// 登录路由
router.post('/login', async (req, res) => {
    try {
        const {username, password} = req.body;
        const users = await readUsers();
        const user = users[username];

        if (!user) {
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
        await updateLastLogin(username);

        // 生成 JWT token
        const token = jwt.sign(
            {
                userId: user.email,
                username: username,
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
            username: username,
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