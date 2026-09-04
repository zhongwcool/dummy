/**
 * 账号数据访问（users 表）。
 * 返回对象字段沿用原 users.json 的命名：password / email / displayName / role / created_at / last_login。
 */
const {getDb, nowIso} = require('./db');
const {ROLES} = require('./roles');

const SELECT_COLUMNS = `
    username,
    password,
    email,
    display_name AS displayName,
    role,
    created_at,
    last_login
`;

function normalizeUsername(username) {
    return String(username || '').trim();
}

function getUser(username) {
    const name = normalizeUsername(username);
    if (!name) {
        return null;
    }
    return getDb().prepare(`SELECT ${SELECT_COLUMNS} FROM users WHERE username = ?`).get(name) || null;
}

function listUsers() {
    return getDb().prepare(`SELECT ${SELECT_COLUMNS} FROM users ORDER BY created_at ASC, username ASC`).all();
}

function countAdmins() {
    return Number(getDb().prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?').get(ROLES.ADMIN).n) || 0;
}

/** 该账号是否为库里仅剩的一个 admin。 */
function isSoleAdmin(username) {
    const user = getUser(username);
    return Boolean(user && user.role === ROLES.ADMIN && countAdmins() <= 1);
}

function canDeleteUser(username, actorUsername) {
    const name = normalizeUsername(username);
    const actor = normalizeUsername(actorUsername);
    if (!name || name === actor) {
        return false;
    }
    const user = getUser(name);
    if (!user) {
        return false;
    }
    return !(user.role === ROLES.ADMIN && countAdmins() <= 1);
}

function userExists(username) {
    const name = normalizeUsername(username);
    if (!name) {
        return false;
    }
    return Boolean(getDb().prepare('SELECT 1 FROM users WHERE username = ?').get(name));
}

/**
 * @param {{username:string, password:string, email?:string, displayName?:string, role?:string}} input
 *        password 需已是 bcrypt 哈希
 */
function createUser(input) {
    const username = normalizeUsername(input.username);
    getDb().prepare(`
        INSERT INTO users (username, password, email, display_name, role, created_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
    `).run(
        username,
        input.password,
        input.email || '',
        input.displayName || username,
        input.role || 'user',
        nowIso()
    );
    return getUser(username);
}

/**
 * 只更新传入的字段；password 需已是 bcrypt 哈希。
 * @returns 更新后的用户，或用户不存在时返回 null
 */
function updateUser(username, fields) {
    const name = normalizeUsername(username);
    const sets = [];
    const values = [];
    if (fields.email !== undefined) {
        sets.push('email = ?');
        values.push(fields.email);
    }
    if (fields.displayName !== undefined) {
        sets.push('display_name = ?');
        values.push(fields.displayName);
    }
    if (fields.role) {
        sets.push('role = ?');
        values.push(fields.role);
    }
    if (fields.password) {
        sets.push('password = ?');
        values.push(fields.password);
    }
    if (!sets.length) {
        return getUser(name);
    }
    values.push(name);
    const info = getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE username = ?`).run(...values);
    if (!Number(info.changes)) {
        return null;
    }
    return getUser(name);
}

function deleteUser(username) {
    const info = getDb().prepare('DELETE FROM users WHERE username = ?').run(normalizeUsername(username));
    return Number(info.changes) > 0;
}

function touchLastLogin(username) {
    getDb().prepare('UPDATE users SET last_login = ? WHERE username = ?').run(nowIso(), normalizeUsername(username));
}

module.exports = {
    getUser,
    listUsers,
    userExists,
    createUser,
    updateUser,
    deleteUser,
    touchLastLogin,
    countAdmins,
    isSoleAdmin,
    canDeleteUser
};
