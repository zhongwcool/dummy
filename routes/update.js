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
const appsDb = require('../utils/appsDb');

// 警告：node-apk-parser 依赖了不安全的 debug 版本
// 建议在生产环境中使用手动输入版本信息的方式
// TODO: 考虑使用其他 APK 解析方案或手动输入版本信息

const appAssetsDir = path.join(__dirname, '../public/app-assets');
const apkFilesDir = path.join(__dirname, '../public/files');
const ASSET_KINDS = new Set(appsDb.ASSET_KINDS);

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

function assetPublicUrl(filename) {
    return `/app-assets/${filename}`;
}

function safeUnlink(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('删除文件失败:', filePath, error.message);
    }
}

function unlinkAssetFile(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('/app-assets/')) {
        return;
    }
    safeUnlink(path.join(appAssetsDir, path.basename(url)));
}

function unlinkAssets(assets) {
    if (!assets) {
        return;
    }
    unlinkAssetFile(assets.logo);
    unlinkAssetFile(assets.banner);
}

/** 只删除本服务 /files/ 下托管的 APK，外链不动。 */
function deleteApkFile(downloadUrl) {
    if (!downloadUrl || typeof downloadUrl !== 'string') {
        return;
    }
    let pathname;
    try {
        pathname = new URL(downloadUrl, 'http://localhost').pathname;
    } catch (_) {
        return;
    }
    if (!pathname.startsWith('/files/')) {
        return;
    }
    const filename = path.basename(pathname);
    if (filename) {
        safeUnlink(path.join(apkFilesDir, filename));
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
    try {
        res.json({apps: appsDb.listApps()});
    } catch (error) {
        console.error('读取应用列表失败:', error);
        res.status(500).json({error: '读取应用列表失败'});
    }
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

    try {
        const latest = appsDb.getLatestVersion(String(packageName));
        if (!latest) {
            return res.status(400).json({
                error: '无效的包名',
                message: '请提供正确的应用包名'
            });
        }
        res.json(latest);
    } catch (error) {
        console.error('检查更新失败:', error);
        res.status(500).json({error: '检查更新失败'});
    }
});

/**
 * @route   GET /api/update/history
 * @desc    获取指定应用或全部应用的版本历史
 * @access  Public
 */
router.get('/history', (req, res) => {
    const {packageName} = req.query;

    try {
        if (packageName) {
            const app = appsDb.getApp(String(packageName));
            if (!app) {
                return res.status(404).json({error: '未找到该应用'});
            }
            return res.json(app);
        }
        res.json({apps: appsDb.listApps()});
    } catch (error) {
        console.error('读取版本历史失败:', error);
        res.status(500).json({error: '读取版本历史失败'});
    }
});

/**
 * @route   GET /api/update
 * @desc    获取指定应用的最新版本；仅一个应用时可省略包名
 * @access  Public
 */
router.get('/', (req, res) => {
    const {packageName} = req.query;

    try {
        if (packageName) {
            const latest = appsDb.getLatestVersion(String(packageName));
            if (!latest) {
                return res.status(404).json({error: '未找到该应用'});
            }
            return res.json({hasUpdate: true, ...latest});
        }

        const latests = appsDb.listLatestVersions();
        if (latests.length === 1) {
            return res.json({hasUpdate: true, ...latests[0]});
        }
        if (latests.length === 0) {
            return res.json({hasUpdate: false});
        }

        return res.status(400).json({
            error: '请提供 packageName',
            message: '存在多个应用，请使用 ?packageName= 指定'
        });
    } catch (error) {
        console.error('读取最新版本失败:', error);
        res.status(500).json({error: '读取最新版本失败'});
    }
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
            safeUnlink(filePath);
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
                safeUnlink(filePath);
                return res.status(400).json({
                    error: '无法读取APK文件信息，请使用手动输入版本信息选项'
                });
            }
        }

        if (!apkInfo.packageName) {
            safeUnlink(filePath);
            return res.status(400).json({error: '无法确定应用包名'});
        }
        if (!Number.isFinite(apkInfo.versionCode)) {
            safeUnlink(filePath);
            return res.status(400).json({error: '无效的版本号'});
        }

        const fileMD5 = await calculateFileMD5(filePath);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const downloadUrl = `${baseUrl}/files/${filename}`;

        let result;
        try {
            result = appsDb.upsertVersion({
                packageName: apkInfo.packageName,
                appName,
                version: {
                    versionName: apkInfo.versionName,
                    versionCode: apkInfo.versionCode,
                    updateDescription,
                    downloadUrl,
                    forceUpdate: forceUpdate === 'true' || forceUpdate === true,
                    fileSize: size,
                    md5: fileMD5
                }
            });
        } catch (error) {
            safeUnlink(filePath);
            console.error('保存版本信息失败:', error);
            return res.status(500).json({error: '保存版本信息失败'});
        }

        // 同一版本号重复上传时，清理被替换的旧安装包
        if (result.replaced && result.replaced.downloadUrl !== downloadUrl) {
            deleteApkFile(result.replaced.downloadUrl);
        }

        res.status(201).json({
            message: '版本更新成功',
            appName: result.appName,
            version: result.version
        });
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
            safeUnlink(req.file.path);
            return res.status(400).json({error: '素材类型无效，请使用 logo 或 banner'});
        }

        try {
            const app = appsDb.getApp(req.params.packageName);
            if (!app) {
                safeUnlink(req.file.path);
                return res.status(404).json({error: '未找到指定应用'});
            }

            const previousUrl = app.assets[kind];
            const imageUrl = assetPublicUrl(req.file.filename);
            const assets = appsDb.setAsset(req.params.packageName, kind, imageUrl);
            if (!assets) {
                safeUnlink(req.file.path);
                return res.status(404).json({error: '未找到指定应用'});
            }
            unlinkAssetFile(previousUrl);

            return res.status(201).json({
                message: '素材已更新',
                assets
            });
        } catch (error) {
            safeUnlink(req.file.path);
            console.error('保存应用素材失败:', error);
            return res.status(500).json({error: '保存素材信息失败'});
        }
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

        const app = appsDb.getApp(req.params.packageName);
        if (!app) {
            return res.status(404).json({error: '未找到指定应用'});
        }

        const previousUrl = app.assets[kind];
        const assets = appsDb.setAsset(req.params.packageName, kind, '');
        if (!assets) {
            return res.status(404).json({error: '未找到指定应用'});
        }
        unlinkAssetFile(previousUrl);

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
        const targetVersionCode = parseInt(versionCode, 10);
        if (!Number.isFinite(targetVersionCode)) {
            return res.status(400).json({error: '无效的版本号'});
        }

        if (!appsDb.getApp(packageName)) {
            return res.status(404).json({error: '未找到指定应用'});
        }

        const result = appsDb.deleteVersion(packageName, targetVersionCode);
        if (!result) {
            return res.status(404).json({error: '未找到指定版本'});
        }

        deleteApkFile(result.version.downloadUrl);
        unlinkAssets(result.removedAssets);

        res.json({message: '版本删除成功'});
    } catch (error) {
        console.error('删除版本失败:', error);
        res.status(500).json({error: '删除版本失败'});
    }
});

module.exports = router;
