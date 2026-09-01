const express = require('express');
const router = express.Router();
const {verifyToken, checkRole} = require('../middleware/auth');
const statsDb = require('../utils/statsDb');
const {OPERATOR_ROLES} = require('../utils/roles');

const APP_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const DEVICE_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;
const REPORT_EVENTS = ['launch', 'heartbeat'];
const REPORT_LIMIT = 10 * 1024;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map();

function clip(value, max) {
    if (value == null) {
        return null;
    }
    const text = String(value).trim();
    if (!text) {
        return null;
    }
    return text.length > max ? text.slice(0, max) : text;
}

function toVersionCode(value) {
    if (value == null || value === '') {
        return null;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 将 IPv4 映射地址写成纯 IPv4。
 * 例如 ::ffff:116.147.147.123 → 116.147.147.123
 */
function normalizeClientIp(ip) {
    if (ip == null) {
        return '';
    }
    let value = String(ip).trim();
    if (!value) {
        return '';
    }
    if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1);
    }
    const zoneIndex = value.indexOf('%');
    if (zoneIndex !== -1) {
        value = value.slice(0, zoneIndex);
    }
    const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (mapped) {
        return mapped[1];
    }
    return value;
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return normalizeClientIp(forwarded.split(',')[0].trim());
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.trim()) {
        return normalizeClientIp(realIp.trim());
    }
    return normalizeClientIp(req.ip || req.socket?.remoteAddress || '');
}

function pruneRateBuckets(now) {
    if (rateBuckets.size < 500) {
        return;
    }
    for (const [key, bucket] of rateBuckets) {
        if (now - bucket.windowStart > RATE_WINDOW_MS * 2) {
            rateBuckets.delete(key);
        }
    }
}

function rateLimitReport(req, res, next) {
    const now = Date.now();
    const ip = clientIp(req) || 'unknown';
    pruneRateBuckets(now);
    const bucket = rateBuckets.get(ip);
    if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
        rateBuckets.set(ip, {windowStart: now, count: 1});
        return next();
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) {
        return res.status(429).json({
            success: false,
            message: '上报过于频繁，请稍后再试'
        });
    }
    return next();
}

function limitReportBody(req, res, next) {
    const length = parseInt(req.headers['content-length'] || '0', 10);
    if (length > REPORT_LIMIT) {
        return res.status(413).json({
            success: false,
            message: '请求体过大'
        });
    }
    next();
}

function requireAppId(req, res) {
    const appId = clip(req.params.appId, 128);
    if (!appId || !APP_ID_RE.test(appId)) {
        res.status(400).json({
            success: false,
            message: '无效的 appId'
        });
        return null;
    }
    return appId;
}

function requireDeviceId(req, res) {
    const deviceId = clip(req.params.deviceId, 128);
    if (!deviceId || !DEVICE_ID_RE.test(deviceId)) {
        res.status(400).json({
            success: false,
            message: '无效的 deviceId'
        });
        return null;
    }
    return deviceId;
}

function optionalPlatform(value, res) {
    const platform = clip(value, 16);
    if (!platform) {
        return '';
    }
    if (!statsDb.PLATFORMS.includes(platform)) {
        res.status(400).json({
            success: false,
            message: '无效的 platform'
        });
        return null;
    }
    return platform;
}

/**
 * @route   POST /api/stats/report
 * @desc    客户端上报设备最后状态（冷启动计打开次数，心跳只刷新在线）
 * @access  Public
 */
router.post('/report', limitReportBody, rateLimitReport, (req, res) => {
    try {
        const body = req.body || {};
        const appId = clip(body.appId, 128);
        const deviceId = clip(body.deviceId, 128);
        const platform = clip(body.platform, 16);

        if (!appId || !APP_ID_RE.test(appId) || !deviceId || !DEVICE_ID_RE.test(deviceId)) {
            return res.status(400).json({
                success: false,
                message: '请提供有效的 appId 和 deviceId'
            });
        }
        if (appId === 'products' || appId === 'report') {
            return res.status(400).json({
                success: false,
                message: 'appId 不可使用保留名称'
            });
        }
        if (!platform || !statsDb.PLATFORMS.includes(platform)) {
            return res.status(400).json({
                success: false,
                message: `platform 必须是 ${statsDb.PLATFORMS.join(' / ')} 之一`
            });
        }
        if (JSON.stringify(body).length > REPORT_LIMIT) {
            return res.status(413).json({
                success: false,
                message: '请求体过大'
            });
        }

        const payload = {
            appId,
            deviceId,
            platform,
            ip: clip(clientIp(req), 45)
        };
        if (Object.prototype.hasOwnProperty.call(body, 'event')) {
            const event = clip(body.event, 16);
            if (!event || !REPORT_EVENTS.includes(event)) {
                return res.status(400).json({
                    success: false,
                    message: `event 必须是 ${REPORT_EVENTS.join(' / ')} 之一`
                });
            }
            payload.event = event;
        }
        if (Object.prototype.hasOwnProperty.call(body, 'appName')) {
            payload.appName = clip(body.appName, 64);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'account')) {
            payload.account = clip(body.account, 128);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'versionName')) {
            payload.versionName = clip(body.versionName, 64);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'versionCode')) {
            payload.versionCode = toVersionCode(body.versionCode);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'osVersion')) {
            payload.osVersion = clip(body.osVersion, 64);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'deviceModel')) {
            payload.deviceModel = clip(body.deviceModel, 64);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'arch')) {
            payload.arch = clip(body.arch, 32);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'locale')) {
            payload.locale = clip(body.locale, 32);
        }
        if (Object.prototype.hasOwnProperty.call(body, 'channel')) {
            payload.channel = clip(body.channel, 32);
        }

        statsDb.upsertReport(payload);

        return res.json({success: true});
    } catch (error) {
        console.error('客户端统计上报失败:', error);
        return res.status(500).json({
            success: false,
            message: '上报失败'
        });
    }
});

/**
 * @route   GET /api/stats/products
 * @desc    产品列表及活跃概览
 * @access  Private (admin, user)
 */
router.get('/products', verifyToken, checkRole(OPERATOR_ROLES), (req, res) => {
    try {
        res.json({
            success: true,
            products: statsDb.listProducts()
        });
    } catch (error) {
        console.error('获取统计产品列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取产品列表失败'
        });
    }
});

/**
 * @route   GET /api/stats/:appId/summary
 * @desc    单产品概览
 * @access  Private (admin, user)
 */
router.get('/:appId/summary', verifyToken, checkRole(OPERATOR_ROLES), (req, res) => {
    try {
        const appId = requireAppId(req, res);
        if (!appId) {
            return;
        }
        const platform = optionalPlatform(req.query.platform, res);
        if (platform === null) {
            return;
        }

        const summary = statsDb.getSummary(appId, platform);
        if (!summary) {
            return res.status(404).json({
                success: false,
                message: '未找到该产品'
            });
        }
        res.json({success: true, summary});
    } catch (error) {
        console.error('获取统计概览失败:', error);
        res.status(500).json({
            success: false,
            message: '获取概览失败'
        });
    }
});

/**
 * @route   GET /api/stats/:appId/devices/:deviceId/daily
 * @desc    单设备每日打开次数
 * @access  Private (admin, user)
 */
router.get('/:appId/devices/:deviceId/daily', verifyToken, checkRole(OPERATOR_ROLES), (req, res) => {
    try {
        const appId = requireAppId(req, res);
        if (!appId) {
            return;
        }
        const deviceId = requireDeviceId(req, res);
        if (!deviceId) {
            return;
        }

        const daily = statsDb.getDeviceDaily(appId, deviceId, req.query.days);
        if (!daily) {
            return res.status(404).json({
                success: false,
                message: '未找到该设备'
            });
        }
        res.json({success: true, ...daily});
    } catch (error) {
        console.error('获取设备日打开失败:', error);
        res.status(500).json({
            success: false,
            message: '获取日打开失败'
        });
    }
});

/**
 * @route   GET /api/stats/:appId/devices
 * @desc    明细分页（按设备各一行）
 * @access  Private (admin, user)
 */
router.get('/:appId/devices', verifyToken, checkRole(OPERATOR_ROLES), (req, res) => {
    try {
        const appId = requireAppId(req, res);
        if (!appId) {
            return;
        }
        const platform = optionalPlatform(req.query.platform, res);
        if (platform === null) {
            return;
        }

        const result = statsDb.listDevices({
            appId,
            platform,
            version: clip(req.query.version, 64),
            q: clip(req.query.q, 128) || clip(req.query.account, 128),
            page: req.query.page,
            pageSize: req.query.pageSize
        });
        if (!result) {
            return res.status(404).json({
                success: false,
                message: '未找到该产品'
            });
        }
        res.json({success: true, ...result});
    } catch (error) {
        console.error('获取设备列表失败:', error);
        res.status(500).json({
            success: false,
            message: '获取设备列表失败'
        });
    }
});

/**
 * @route   GET /api/stats/:appId/trend
 * @desc    日活与打开次数趋势
 * @access  Private (admin, user)
 */
router.get('/:appId/trend', verifyToken, checkRole(OPERATOR_ROLES), (req, res) => {
    try {
        const appId = requireAppId(req, res);
        if (!appId) {
            return;
        }
        const platform = optionalPlatform(req.query.platform, res);
        if (platform === null) {
            return;
        }

        const trend = statsDb.getTrend(appId, req.query.days, platform);
        if (!trend) {
            return res.status(404).json({
                success: false,
                message: '未找到该产品'
            });
        }
        res.json({success: true, trend});
    } catch (error) {
        console.error('获取统计趋势失败:', error);
        res.status(500).json({
            success: false,
            message: '获取趋势失败'
        });
    }
});

/**
 * @route   PUT /api/stats/:appId
 * @desc    修改产品显示名
 * @access  Private (admin, user)
 */
router.put('/:appId', verifyToken, checkRole(OPERATOR_ROLES), (req, res) => {
    try {
        const appId = requireAppId(req, res);
        if (!appId) {
            return;
        }
        const appName = clip(req.body && req.body.appName, 64);
        if (!appName) {
            return res.status(400).json({
                success: false,
                message: '请提供显示名'
            });
        }
        if (!statsDb.renameProduct(appId, appName)) {
            return res.status(404).json({
                success: false,
                message: '未找到该产品'
            });
        }
        res.json({success: true, appId, appName});
    } catch (error) {
        console.error('更新产品名称失败:', error);
        res.status(500).json({
            success: false,
            message: '更新产品名称失败'
        });
    }
});

/**
 * @route   DELETE /api/stats/:appId
 * @desc    删除产品及全部统计数据
 * @access  Private (admin, user)
 */
router.delete('/:appId', verifyToken, checkRole(OPERATOR_ROLES), (req, res) => {
    try {
        const appId = requireAppId(req, res);
        if (!appId) {
            return;
        }
        if (!statsDb.deleteProduct(appId)) {
            return res.status(404).json({
                success: false,
                message: '未找到该产品'
            });
        }
        res.json({success: true, message: '产品统计数据已删除'});
    } catch (error) {
        console.error('删除产品统计失败:', error);
        res.status(500).json({
            success: false,
            message: '删除产品失败'
        });
    }
});

module.exports = router;
