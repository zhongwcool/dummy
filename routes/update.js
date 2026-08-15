const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const upload = require('../middleware/fileUpload');
const assetUpload = require('../middleware/appAssetUpload');
const {verifyToken} = require('../middleware/auth');
const ApkReader = require('node-apk-parser');

// 警告：node-apk-parser 依赖了不安全的 debug 版本
// 建议在生产环境中使用手动输入版本信息的方式
// TODO: 考虑使用其他 APK 解析方案或手动输入版本信息

const appVersionsPath = path.join(__dirname, '../data/appVersions.json');
const appAssetsDir = path.join(__dirname, '../public/app-assets');
const ASSET_KINDS = new Set(['logo', 'banner']);

const calculateFileMD5 = (filePath) => {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (data) => {
            hash.update(data);
        });

        stream.on('end', () => {
            resolve(hash.digest('hex').toUpperCase());
        });

        stream.on('error', (error) => {
            reject(error);
        });
    });
};

function hasVersion(version) {
    return Boolean(version && typeof version === 'object' && version.versionCode != null);
}

function appNameFromPackage(packageName, fallback) {
    if (fallback && String(fallback).trim()) {
        return String(fallback).trim();
    }
    const parts = String(packageName || '').split('.');
    return parts[parts.length - 1] || packageName || 'app';
}

function normalizeStore(raw) {
    if (raw && raw.apps && typeof raw.apps === 'object' && !Array.isArray(raw.apps)) {
        return {apps: raw.apps};
    }

    if (raw && raw.android) {
        const latest = raw.android.latest || {};
        const packageName = latest.packageName;
        if (!packageName) {
            return {apps: {}};
        }
        return {
            apps: {
                [packageName]: {
                    appName: appNameFromPackage(packageName),
                    packageName,
                    latest,
                    history: raw.android.history || []
                }
            }
        };
    }

    return {apps: {}};
}

const getAppVersions = () => {
    try {
        const data = fs.readFileSync(appVersionsPath, 'utf8');
        return normalizeStore(JSON.parse(data));
    } catch (error) {
        console.error('读取应用版本数据失败:', error);
        return {apps: {}};
    }
};

const saveAppVersions = (data) => {
    try {
        fs.writeFileSync(appVersionsPath, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('保存应用版本数据失败:', error);
        return false;
    }
};

function emptyAssets() {
    return {logo: '', banner: ''};
}

function getAssets(app) {
    const raw = app && app.assets ? app.assets : {};
    return {
        logo: typeof raw.logo === 'string' ? raw.logo : '',
        banner: typeof raw.banner === 'string' ? raw.banner : ''
    };
}

function listApps(store) {
    return Object.values(store.apps || {})
        .filter((app) => hasVersion(app.latest) || (app.history && app.history.length > 0))
        .map((app) => ({
            appName: app.appName || appNameFromPackage(app.packageName),
            packageName: app.packageName,
            latest: app.latest || {},
            history: app.history || [],
            assets: getAssets(app)
        }));
}

function findApp(store, packageName) {
    return (store.apps || {})[packageName] || null;
}

function assetPublicUrl(filename) {
    return `/app-assets/${filename}`;
}

function unlinkAssetFile(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('/app-assets/')) {
        return;
    }
    const filename = path.basename(url);
    const fullPath = path.join(appAssetsDir, filename);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }
}

function unlinkAppAssets(app) {
    const assets = getAssets(app);
    unlinkAssetFile(assets.logo);
    unlinkAssetFile(assets.banner);
}

function deleteApkFile(downloadUrl) {
    if (!downloadUrl) {
        return;
    }
    const filename = downloadUrl.split('/').pop();
    if (!filename) {
        return;
    }
    const filePath = path.join(__dirname, '../public/files', filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

const readApkInfo = async (filePath) => {
    try {
        console.log(`尝试读取APK文件: ${filePath}`);
        const reader = ApkReader.readFile(filePath);
        const manifest = reader.readManifestSync();
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
 * @route   GET /api/update/apps
 * @desc    获取全部应用及其版本
 * @access  Public
 */
router.get('/apps', (req, res) => {
    const store = getAppVersions();
    res.json({apps: listApps(store)});
});

/**
 * @route   GET /api/update/check
 * @desc    根据客户端包名获取最新版本信息
 * @access  Public
 */
router.get('/check', (req, res) => {
    const {packageName} = req.query;
    if (!packageName) {
        return res.status(400).json({
            error: '无效的包名',
            message: '请提供正确的应用包名'
        });
    }

    const app = findApp(getAppVersions(), packageName);
    if (!app || !hasVersion(app.latest)) {
        return res.status(400).json({
            error: '无效的包名',
            message: '请提供正确的应用包名'
        });
    }

    res.json(app.latest);
});

/**
 * @route   GET /api/update/history
 * @desc    获取指定应用或全部应用的版本历史
 * @access  Public
 */
router.get('/history', (req, res) => {
    const store = getAppVersions();
    const {packageName} = req.query;

    if (packageName) {
        const app = findApp(store, packageName);
        if (!app) {
            return res.status(404).json({error: '未找到该应用'});
        }
        return res.json({
            appName: app.appName,
            packageName: app.packageName,
            latest: app.latest || {},
            history: app.history || [],
            assets: getAssets(app)
        });
    }

    res.json({apps: listApps(store)});
});

/**
 * @route   GET /api/update
 * @desc    获取指定应用的最新版本；仅一个应用时可省略包名
 * @access  Public
 */
router.get('/', (req, res) => {
    const store = getAppVersions();
    const {packageName} = req.query;
    const apps = store.apps || {};

    if (packageName) {
        const app = findApp(store, packageName);
        if (!app || !hasVersion(app.latest)) {
            return res.status(404).json({error: '未找到该应用'});
        }
        return res.json({
            hasUpdate: true,
            ...app.latest
        });
    }

    const keys = Object.keys(apps).filter((key) => hasVersion(apps[key].latest));
    if (keys.length === 1) {
        return res.json({
            hasUpdate: true,
            ...apps[keys[0]].latest
        });
    }
    if (keys.length === 0) {
        return res.json({hasUpdate: false});
    }

    return res.status(400).json({
        error: '请提供 packageName',
        message: '存在多个应用，请使用 ?packageName= 指定'
    });
});

/**
 * @route   POST /api/update/upload
 * @desc    上传APK文件并按包名更新对应应用
 * @access  Private
 */
router.post('/upload', verifyToken, upload.single('apk'), async (req, res) => {
    try {
        console.log('收到上传请求');
        console.log('请求体:', req.body);
        console.log('文件信息:', req.file);

        if (!req.file) {
            console.error('没有上传文件或文件类型不正确');
            return res.status(400).json({error: '没有上传文件或文件类型不正确'});
        }

        const {filename, path: filePath, size} = req.file;
        const {
            updateDescription,
            forceUpdate = false,
            versionName,
            versionCode,
            packageName,
            appName
        } = req.body;

        if (!updateDescription) {
            fs.unlinkSync(filePath);
            return res.status(400).json({error: '请提供更新说明'});
        }

        let apkInfo;
        if (versionName && versionCode) {
            apkInfo = {
                versionName,
                versionCode: parseInt(versionCode),
                packageName: packageName || 'com.example.app'
            };
        } else {
            try {
                apkInfo = await readApkInfo(filePath);
            } catch (error) {
                fs.unlinkSync(filePath);
                return res.status(400).json({
                    error: '无法读取APK文件信息，请使用手动输入版本信息选项'
                });
            }
        }

        if (!apkInfo.packageName) {
            fs.unlinkSync(filePath);
            return res.status(400).json({error: '无法确定应用包名'});
        }

        const fileMD5 = await calculateFileMD5(filePath);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const downloadUrl = `${baseUrl}/files/${filename}`;
        const store = getAppVersions();
        if (!store.apps) {
            store.apps = {};
        }

        const targetPackage = apkInfo.packageName;
        let app = store.apps[targetPackage];
        if (!app) {
            app = {
                appName: appNameFromPackage(targetPackage, appName),
                packageName: targetPackage,
                latest: {},
                history: [],
                assets: emptyAssets()
            };
            store.apps[targetPackage] = app;
        } else if (appName && String(appName).trim()) {
            app.appName = String(appName).trim();
        }

        if (hasVersion(app.latest)) {
            app.history = app.history || [];
            const currentLatest = {
                ...app.latest,
                releaseDate: new Date().toISOString().split('T')[0]
            };
            const existingVersionIndex = app.history.findIndex(
                (v) => v.versionCode === currentLatest.versionCode
            );
            if (existingVersionIndex === -1) {
                app.history.unshift(currentLatest);
            }
        }

        app.latest = {
            versionName: apkInfo.versionName,
            versionCode: apkInfo.versionCode,
            packageName: targetPackage,
            updateDescription,
            downloadUrl,
            forceUpdate: forceUpdate === 'true' || forceUpdate === true,
            fileSize: size,
            md5: fileMD5,
            uploadDate: new Date().toISOString().split('T')[0]
        };

        if (saveAppVersions(store)) {
            res.status(201).json({
                message: '版本更新成功',
                appName: app.appName,
                version: app.latest
            });
        } else {
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
 * @route   POST /api/update/:packageName/assets
 * @desc    上传应用 Logo / Banner
 * @access  Private
 */
router.post('/:packageName/assets', verifyToken, (req, res) => {
    assetUpload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({error: '图片大小不能超过 1MB'});
            }
            return res.status(400).json({error: err.message});
        }
        if (err) {
            return res.status(400).json({error: err.message});
        }
        if (!req.file) {
            return res.status(400).json({error: '请上传图片文件'});
        }

        const kind = String(req.body.kind || '').toLowerCase();
        if (!ASSET_KINDS.has(kind)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({error: '素材类型无效，请使用 logo 或 banner'});
        }

        const store = getAppVersions();
        const app = findApp(store, req.params.packageName);
        if (!app) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({error: '未找到指定应用'});
        }

        const assets = getAssets(app);
        const imageUrl = assetPublicUrl(req.file.filename);

        if (kind === 'logo') {
            unlinkAssetFile(assets.logo);
            assets.logo = imageUrl;
        } else {
            unlinkAssetFile(assets.banner);
            assets.banner = imageUrl;
        }

        app.assets = assets;
        if (!saveAppVersions(store)) {
            fs.unlinkSync(req.file.path);
            return res.status(500).json({error: '保存素材信息失败'});
        }

        return res.status(201).json({
            message: '素材已更新',
            assets
        });
    });
});

/**
 * @route   DELETE /api/update/:packageName/assets
 * @desc    删除应用 Logo / Banner
 * @access  Private
 */
router.delete('/:packageName/assets', verifyToken, (req, res) => {
    try {
        const kind = String(req.query.kind || '').toLowerCase();
        if (!ASSET_KINDS.has(kind)) {
            return res.status(400).json({error: '素材类型无效，请使用 logo 或 banner'});
        }

        const store = getAppVersions();
        const app = findApp(store, req.params.packageName);
        if (!app) {
            return res.status(404).json({error: '未找到指定应用'});
        }

        const assets = getAssets(app);
        if (kind === 'logo') {
            unlinkAssetFile(assets.logo);
            assets.logo = '';
        } else {
            unlinkAssetFile(assets.banner);
            assets.banner = '';
        }

        app.assets = assets;
        if (!saveAppVersions(store)) {
            return res.status(500).json({error: '保存素材信息失败'});
        }

        return res.json({
            message: '素材已删除',
            assets
        });
    } catch (error) {
        console.error('删除应用素材失败:', error);
        return res.status(500).json({error: '删除素材失败'});
    }
});

/**
 * @route   DELETE /api/update/:packageName/:versionCode
 * @desc    删除指定应用的指定版本
 * @access  Private
 */
router.delete('/:packageName/:versionCode', verifyToken, (req, res) => {
    try {
        const {packageName, versionCode} = req.params;
        const store = getAppVersions();
        const app = findApp(store, packageName);
        const targetVersionCode = parseInt(versionCode);

        if (!app) {
            return res.status(404).json({error: '未找到指定应用'});
        }

        const historyIndex = (app.history || []).findIndex(
            (v) => v.versionCode === targetVersionCode
        );
        const isLatestVersion = hasVersion(app.latest) && app.latest.versionCode === targetVersionCode;

        if (historyIndex === -1 && !isLatestVersion) {
            return res.status(404).json({error: '未找到指定版本'});
        }

        const version = isLatestVersion ? app.latest : app.history[historyIndex];
        deleteApkFile(version.downloadUrl);

        if (isLatestVersion) {
            if (app.history && app.history.length > 0) {
                app.latest = app.history[0];
                app.history.shift();
            } else {
                app.latest = {};
            }
        } else {
            app.history.splice(historyIndex, 1);
        }

        if (!hasVersion(app.latest) && (!app.history || app.history.length === 0)) {
            unlinkAppAssets(app);
            delete store.apps[packageName];
        }

        if (saveAppVersions(store)) {
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
