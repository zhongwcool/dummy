const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const upload = require('../middleware/fileUpload');
const ApkReader = require('adbkit-apkreader');

// 读取应用版本数据
const appVersionsPath = path.join(__dirname, '../data/appVersions.json');
const getAppVersions = () => {
    try {
        const data = fs.readFileSync(appVersionsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('读取应用版本数据失败:', error);
        return {android: {latest: {}, history: []}};
    }
};

// 保存应用版本数据
const saveAppVersions = (data) => {
    try {
        fs.writeFileSync(appVersionsPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('保存应用版本数据失败:', error);
        return false;
    }
};

// 读取APK文件的版本信息
const readApkInfo = async (filePath) => {
    try {
        console.log(`尝试读取APK文件: ${filePath}`);
        const reader = await ApkReader.open(filePath);
        console.log('成功打开APK文件');

        const manifest = await reader.readManifest();
        console.log('成功读取AndroidManifest.xml');
        console.log('清单内容:', JSON.stringify(manifest, null, 2));

        return {
            versionName: manifest.versionName,
            versionCode: manifest.versionCode,
            packageName: manifest.package
        };
    } catch (error) {
        console.error('读取APK信息失败:', error);
        console.error('错误堆栈:', error.stack);
        throw new Error(`无法读取APK文件信息: ${error.message}`);
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

/**
 * @route   POST /api/update/upload
 * @desc    上传APK文件并更新版本信息
 * @access  Private (应该添加身份验证中间件)
 */
router.post('/upload', upload.single('apk'), async (req, res) => {
    try {
        console.log('收到上传请求');
        console.log('请求体:', req.body);
        console.log('文件信息:', req.file);

        if (!req.file) {
            console.error('没有上传文件或文件类型不正确');
            return res.status(400).json({error: '没有上传文件或文件类型不正确'});
        }

        // 获取文件信息
        const {filename, path: filePath, size} = req.file;
        console.log(`文件已保存到: ${filePath}`);

        // 获取请求中的更新说明和强制更新标志
        const {updateDescription, forceUpdate = false, versionName, versionCode, packageName} = req.body;
        console.log(`更新说明: ${updateDescription}`);
        console.log(`强制更新: ${forceUpdate}`);
        console.log(`手动输入的版本名称: ${versionName}`);
        console.log(`手动输入的版本号: ${versionCode}`);
        console.log(`手动输入的包名: ${packageName}`);

        // 验证更新说明
        if (!updateDescription) {
            console.error('缺少更新说明');
            // 删除上传的文件
            fs.unlinkSync(filePath);
            return res.status(400).json({error: '请提供更新说明'});
        }

        let apkInfo;

        // 如果提供了手动输入的版本信息，则使用手动输入的信息
        if (versionName && versionCode) {
            console.log('使用手动输入的版本信息');
            apkInfo = {
                versionName,
                versionCode: parseInt(versionCode),
                packageName: packageName || 'com.example.app'
            };
        } else {
            // 否则尝试从APK文件中读取版本信息
            try {
                console.log('开始读取APK信息');
                apkInfo = await readApkInfo(filePath);
                console.log('APK信息:', apkInfo);
            } catch (error) {
                console.error('读取APK信息失败:', error);
                // 删除上传的文件
                fs.unlinkSync(filePath);
                return res.status(400).json({
                    error: '无法读取APK文件信息，请使用手动输入版本信息选项'
                });
            }
        }

        // 构建下载URL
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const downloadUrl = `${baseUrl}/uploads/apk/${filename}`;
        console.log(`下载URL: ${downloadUrl}`);

        // 读取当前版本信息
        const appVersions = getAppVersions();

        // 将当前最新版本添加到历史记录中（如果存在）
        if (appVersions.android.latest && Object.keys(appVersions.android.latest).length > 0) {
            if (!appVersions.android.history) {
                appVersions.android.history = [];
            }

            // 添加发布日期到当前版本
            const currentLatest = {
                ...appVersions.android.latest,
                releaseDate: new Date().toISOString().split('T')[0]
            };

            // 检查是否已存在相同版本
            const existingVersionIndex = appVersions.android.history.findIndex(
                v => v.versionCode === currentLatest.versionCode
            );

            if (existingVersionIndex === -1) {
                appVersions.android.history.unshift(currentLatest);
            }
        }

        // 更新最新版本信息
        appVersions.android.latest = {
            versionName: apkInfo.versionName,
            versionCode: apkInfo.versionCode,
            packageName: apkInfo.packageName,
            updateDescription,
            downloadUrl,
            forceUpdate: forceUpdate === 'true' || forceUpdate === true,
            fileSize: size,
            uploadDate: new Date().toISOString().split('T')[0]
        };
        console.log('新版本信息:', appVersions.android.latest);

        // 保存更新后的版本信息
        console.log('保存版本信息');
        if (saveAppVersions(appVersions)) {
            console.log('版本信息保存成功');
            res.status(201).json({
                message: '版本更新成功',
                version: appVersions.android.latest
            });
        } else {
            console.error('保存版本信息失败');
            // 删除上传的文件
            fs.unlinkSync(filePath);
            res.status(500).json({error: '保存版本信息失败'});
        }
    } catch (error) {
        console.error('上传APK文件失败:', error);
        console.error('错误堆栈:', error.stack);
        res.status(500).json({error: error.message || '上传APK文件失败'});
    }
});

/**
 * @route   DELETE /api/update/:versionCode
 * @desc    删除指定版本的APK
 * @access  Private (应该添加身份验证中间件)
 */
router.delete('/:versionCode', (req, res) => {
    try {
        const {versionCode} = req.params;
        const appVersions = getAppVersions();

        // 检查是否为最新版本
        if (appVersions.android.latest.versionCode === parseInt(versionCode)) {
            return res.status(400).json({error: '不能删除最新版本'});
        }

        // 在历史记录中查找版本
        const versionIndex = appVersions.android.history.findIndex(
            v => v.versionCode === parseInt(versionCode)
        );

        if (versionIndex === -1) {
            return res.status(404).json({error: '未找到指定版本'});
        }

        // 获取下载URL以删除文件
        const version = appVersions.android.history[versionIndex];
        const downloadUrl = version.downloadUrl;
        const filename = downloadUrl.split('/').pop();
        const filePath = path.join(__dirname, '../public/uploads/apk', filename);

        // 尝试删除文件
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // 从历史记录中删除版本
        appVersions.android.history.splice(versionIndex, 1);

        // 保存更新后的版本信息
        if (saveAppVersions(appVersions)) {
            res.json({message: '版本删除成功'});
        } else {
            res.status(500).json({error: '保存版本信息失败'});
        }
    } catch (error) {
        console.error('删除版本失败:', error);
        res.status(500).json({error: '删除版本失败'});
    }
});

module.exports = router; 