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
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify({
        username: data.username,
        displayName: data.displayName,
        role: data.role
    }));
}

function authHeaders(extra) {
    const headers = extra ? Object.assign({}, extra) : {};
    const token = getToken();
    if (token) {
        headers.Authorization = 'Bearer ' + token;
    }
    return headers;
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
        return data.user;
    } catch (error) {
        clearAuth();
        return null;
    }
}

async function requireAdminAuth() {
    const user = await verifyAuth();
    if (!user) {
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
