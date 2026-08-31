// routes/users.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const {verifyToken, checkRole} = require('../middleware/auth');
const {userDb} = require('../utils/fileHandler');
const {ALL_ROLES, USER_MANAGER_ROLES} = require('../utils/roles');

function sanitizeUser(username, user) {
    return {
        username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        created_at: user.created_at,
        last_login: user.last_login
    };
}

// 获取用户列表（需要 admin 权限）
router.get('/', verifyToken, checkRole(USER_MANAGER_ROLES), async (req, res) => {
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

router.post('/', verifyToken, checkRole(USER_MANAGER_ROLES), async (req, res) => {
    try {
        const {username, password, email, displayName, role} = req.body;
        const trimmedUsername = String(username || '').trim();

        if (!trimmedUsername || !password) {
            return res.status(400).json({
                success: false,
                message: '用户名和密码为必填项'
            });
        }

        if (!ALL_ROLES.includes(role || 'user')) {
            return res.status(400).json({
                success: false,
                message: '无效的角色'
            });
        }

        const users = await userDb.read();
        if (users[trimmedUsername]) {
            return res.status(409).json({
                success: false,
                message: '用户名已存在'
            });
        }

        users[trimmedUsername] = {
            password: await bcrypt.hash(password, 10),
            email: email || '',
            displayName: displayName || trimmedUsername,
            role: role || 'user',
            created_at: new Date().toISOString(),
            last_login: null
        };

        await userDb.write(users);
        res.status(201).json({
            success: true,
            user: sanitizeUser(trimmedUsername, users[trimmedUsername]),
            message: '用户创建成功'
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            message: '创建用户失败'
        });
    }
});

router.put('/:username', verifyToken, checkRole(USER_MANAGER_ROLES), async (req, res) => {
    try {
        const username = req.params.username;
        const {email, displayName, role, password} = req.body;
        const users = await userDb.read();
        const user = users[username];

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        if (role && !ALL_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: '无效的角色'
            });
        }

        if (email !== undefined) user.email = email;
        if (displayName !== undefined) user.displayName = displayName;
        if (role) user.role = role;
        if (password) user.password = await bcrypt.hash(password, 10);

        users[username] = user;
        await userDb.write(users);

        res.json({
            success: true,
            user: sanitizeUser(username, user),
            message: '用户更新成功'
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: '更新用户失败'
        });
    }
});

router.delete('/:username', verifyToken, checkRole(USER_MANAGER_ROLES), async (req, res) => {
    try {
        const username = req.params.username;
        if (req.user.username === username) {
            return res.status(400).json({
                success: false,
                message: '不能删除当前登录账号'
            });
        }

        const users = await userDb.read();
        if (!users[username]) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        delete users[username];
        await userDb.write(users);

        res.json({
            success: true,
            message: '用户删除成功'
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: '删除用户失败'
        });
    }
});

module.exports = router;