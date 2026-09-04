// routes/users.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const {verifyToken, checkRole} = require('../middleware/auth');
const usersDb = require('../utils/usersDb');
const {ALL_ROLES, USER_MANAGER_ROLES, ROLES} = require('../utils/roles');

function sanitizeUser(user, actorUsername, adminCount) {
    const isLastAdmin = user.role === ROLES.ADMIN && adminCount <= 1;
    return {
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        created_at: user.created_at,
        last_login: user.last_login,
        canDelete: user.username !== actorUsername && !isLastAdmin,
        isLastAdmin
    };
}

// 获取用户列表（需要 admin 权限）
router.get('/', verifyToken, checkRole(USER_MANAGER_ROLES), (req, res) => {
    try {
        const adminCount = usersDb.countAdmins();
        res.json({
            success: true,
            users: usersDb.listUsers().map((user) => sanitizeUser(user, req.user.username, adminCount))
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
router.get('/me', verifyToken, (req, res) => {
    try {
        const user = usersDb.getUser(req.user.username);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        res.json({
            success: true,
            user: sanitizeUser(user, req.user.username, usersDb.countAdmins())
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

        if (usersDb.userExists(trimmedUsername)) {
            return res.status(409).json({
                success: false,
                message: '用户名已存在'
            });
        }

        const user = usersDb.createUser({
            username: trimmedUsername,
            password: await bcrypt.hash(password, 10),
            email: email || '',
            displayName: displayName || trimmedUsername,
            role: role || 'user'
        });

        res.status(201).json({
            success: true,
            user: sanitizeUser(user, req.user.username, usersDb.countAdmins()),
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

        if (!usersDb.userExists(username)) {
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

        if (role && role !== ROLES.ADMIN && usersDb.isSoleAdmin(username)) {
            return res.status(400).json({
                success: false,
                message: '不能取消最后一个管理员'
            });
        }

        const user = usersDb.updateUser(username, {
            email,
            displayName,
            role,
            password: password ? await bcrypt.hash(password, 10) : undefined
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

        res.json({
            success: true,
            user: sanitizeUser(user, req.user.username, usersDb.countAdmins()),
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

router.delete('/:username', verifyToken, checkRole(USER_MANAGER_ROLES), (req, res) => {
    try {
        const username = req.params.username;
        if (req.user.username === username) {
            return res.status(400).json({
                success: false,
                message: '不能删除当前登录账号'
            });
        }
        if (usersDb.isSoleAdmin(username)) {
            return res.status(400).json({
                success: false,
                message: '不能删除最后一个管理员'
            });
        }

        if (!usersDb.deleteUser(username)) {
            return res.status(404).json({
                success: false,
                message: '用户不存在'
            });
        }

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
