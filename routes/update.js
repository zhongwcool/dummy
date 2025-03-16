const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// 读取应用版本数据
const appVersionsPath = path.join(__dirname, '../data/appVersions.json');
const getAppVersions = () => {
    try {
        const data = fs.readFileSync(appVersionsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取应用版本数据失败:', error);
        return {android: {latest: {}}};
    }
};

/**
 * @route   GET /api/update
 * @desc    获取Android应用的最新版本信息
 * @access  Public
 */
router.get('/', (req, res) => {
    const appVersions = getAppVersions();
    const androidLatest = appVersions.android.latest;

    res.json({
        hasUpdate: true,
        ...androidLatest
    });
});

/**
 * @route   GET /api/update/check
 * @desc    根据客户端当前版本检查是否有更新
 * @access  Public
 */
router.get('/check', (req, res) => {
    const {versionCode} = req.query;
    const appVersions = getAppVersions();
    const latestVersion = appVersions.android.latest;

    // 检查是否需要更新
    const clientVersionCode = parseInt(versionCode) || 0;
    const hasUpdate = clientVersionCode < latestVersion.versionCode;

    res.json({
        hasUpdate,
        ...latestVersion
    });
});

/**
 * @route   GET /api/update/history
 * @desc    获取应用版本历史记录
 * @access  Public
 */
router.get('/history', (req, res) => {
    const appVersions = getAppVersions();

    res.json({
        latest: appVersions.android.latest,
        history: appVersions.android.history || []
    });
});

module.exports = router; 