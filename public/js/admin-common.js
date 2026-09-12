const TOKEN_KEY = 'authToken';
const USER_KEY = 'authUser';

function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (error) {
        return null;
    }
}

function saveAuth(data) {
    persistUser({
        username: data.username,
        displayName: data.displayName,
        role: data.role
    });
    localStorage.setItem(TOKEN_KEY, data.token);
}

function persistUser(user) {
    const prev = getUser() || {};
    localStorage.setItem(USER_KEY, JSON.stringify({
        username: user.username || prev.username,
        displayName: user.displayName || prev.displayName,
        role: user.role || prev.role
    }));
}

function userRole(user) {
    return (user && user.role) || '';
}

function hasAnyRole(user, roles) {
    return Array.isArray(roles) && roles.indexOf(userRole(user)) !== -1;
}

function applyDashboardEntries(user) {
    document.querySelectorAll('[data-roles]').forEach(function (card) {
        const roles = card.getAttribute('data-roles').split(',').map(function (item) {
            return item.trim();
        }).filter(Boolean);
        card.hidden = roles.length > 0 && !hasAnyRole(user, roles);
    });
}

function authHeaders(extra) {
    const headers = extra ? Object.assign({}, extra) : {};
    const token = getToken();
    if (token) {
        headers.Authorization = 'Bearer ' + token;
    }
    return headers;
}

function deleteAuthHeaders(password) {
    return authHeaders({ 'X-Confirm-Password': password });
}

let confirmActionResolver = null;

function finishConfirmAction(ok) {
    const root = document.getElementById('adminConfirmDialog');
    if (root) {
        root.hidden = true;
    }
    const resolve = confirmActionResolver;
    confirmActionResolver = null;
    if (resolve) {
        resolve(!!ok);
    }
}

function ensureConfirmDialog() {
    let root = document.getElementById('adminConfirmDialog');
    if (root) {
        return root;
    }

    root = document.createElement('div');
    root.id = 'adminConfirmDialog';
    root.className = 'admin-confirm';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'adminConfirmTitle');
    root.innerHTML =
        '<div class="admin-confirm-card">' +
            '<h2 class="admin-confirm-title" id="adminConfirmTitle">确认删除</h2>' +
            '<p class="admin-confirm-msg" id="adminConfirmMessage"></p>' +
            '<div class="admin-confirm-actions">' +
                '<button type="button" class="btn btn-light btn-sm" data-confirm="no">取消</button>' +
                '<button type="button" class="btn btn-outline-danger btn-sm" data-confirm="yes">确定删除</button>' +
            '</div>' +
        '</div>';

    root.addEventListener('click', function (event) {
        if (event.target === root) {
            finishConfirmAction(false);
        }
    });
    root.querySelector('[data-confirm="no"]').addEventListener('click', function () {
        finishConfirmAction(false);
    });
    root.querySelector('[data-confirm="yes"]').addEventListener('click', function () {
        finishConfirmAction(true);
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && root && !root.hidden) {
            finishConfirmAction(false);
        }
    });
    document.body.appendChild(root);
    return root;
}

function confirmAction(message) {
    const root = ensureConfirmDialog();
    if (confirmActionResolver) {
        finishConfirmAction(false);
    }
    document.getElementById('adminConfirmMessage').textContent = message;
    root.hidden = false;
    const cancelBtn = root.querySelector('[data-confirm="no"]');
    if (cancelBtn) {
        cancelBtn.focus();
    }
    return new Promise(function (resolve) {
        confirmActionResolver = resolve;
    });
}

async function confirmDelete(message) {
    const ok = await confirmAction(message);
    if (!ok) {
        return null;
    }
    const password = window.prompt('请输入登录密码以确认删除');
    if (password == null) {
        return null;
    }
    if (!String(password)) {
        alert('请输入密码');
        return null;
    }
    return String(password);
}

function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

function logout() {
    clearAuth();
    location.replace('/admin');
}

async function verifyAuth() {
    const token = getToken();
    if (!token) {
        return null;
    }

    try {
        const response = await fetch('/api/auth/verify-token', {
            headers: authHeaders()
        });
        const data = await response.json();
        if (!response.ok || !data.valid) {
            clearAuth();
            return null;
        }
        if (data.user) {
            persistUser(data.user);
        }
        return data.user;
    } catch (error) {
        clearAuth();
        return null;
    }
}

async function requireAdminAuth(allowedRoles) {
    const user = await verifyAuth();
    if (!user) {
        location.replace('/admin');
        return null;
    }
    if (allowedRoles && allowedRoles.length && !hasAnyRole(user, allowedRoles)) {
        location.replace('/admin');
        return null;
    }
    return user;
}

function fillAuthBar() {
    const user = getUser();
    const el = document.getElementById('currentUser');
    if (el) {
        el.textContent = (user && (user.displayName || user.username)) || '已登录';
    }
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    fillServiceVersion();
}

let serviceVersionPromise;

function loadServiceVersion() {
    if (!serviceVersionPromise) {
        serviceVersionPromise = fetch('/api/version')
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('version request failed');
                }
                return response.json();
            })
            .catch(function () {
                return null;
            });
    }
    return serviceVersionPromise;
}

function ensureServiceVersionEl() {
    let el = document.querySelector('[data-service-version]');
    if (el) {
        return el;
    }

    const footer = document.createElement('footer');
    footer.className = 'service-footer';
    el = document.createElement('p');
    el.className = 'service-version';
    el.setAttribute('data-service-version', '');
    footer.appendChild(el);
    document.body.appendChild(footer);
    return el;
}

function fillServiceVersion() {
    const el = ensureServiceVersionEl();
    loadServiceVersion().then(function (data) {
        if (!data || !data.display) {
            return;
        }
        el.textContent = data.display;
        if (data.commitFull) {
            el.title = data.commitFull;
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillServiceVersion);
} else {
    fillServiceVersion();
}

async function apiRequest(url, options) {
    const response = await fetch(url, options);
    let data = {};
    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (response.status === 401) {
        clearAuth();
        location.replace('/admin');
        throw new Error(data.message || '登录已过期，请重新登录');
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || '请求失败');
    }

    return data;
}

function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatFileSize(bytes) {
    if (!bytes) {
        return '';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatDescription(text) {
    return escapeHtml(text || '').replace(/\n/g, '<br>');
}
