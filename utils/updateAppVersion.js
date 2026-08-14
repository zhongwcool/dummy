/**
 * 应用版本更新工具
 * 用法: node utils/updateAppVersion.js <包名> <版本名> <版本号> <更新内容> <下载链接> [true/false]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 5) {
    console.log('用法: node updateAppVersion.js <包名> <版本名> <版本号> <更新描述> <下载链接> [强制更新]');
    console.log('示例: node updateAppVersion.js com.example.app 1.0.2 3 "1.修复bug\\n2.优化性能" https://example.com/app.apk false');
    process.exit(1);
}

const packageName = args[0];
const versionName = args[1];
const versionCode = parseInt(args[2]);
const updateDescription = args[3];
const downloadUrl = args[4];
const forceUpdate = args[5] === 'true';

if (isNaN(versionCode) || versionCode <= 0) {
    console.error('错误: 版本号必须是正整数');
    process.exit(1);
}

const appVersionsPath = path.join(__dirname, '../data/appVersions.json');
let store;

try {
    store = JSON.parse(fs.readFileSync(appVersionsPath, 'utf8'));
} catch (error) {
    console.error('读取版本数据失败:', error);
    process.exit(1);
}

if (!store.apps || typeof store.apps !== 'object') {
    store = {apps: {}};
}

const appName = packageName.split('.').pop() || packageName;
let app = store.apps[packageName];
if (!app) {
    app = {
        appName,
        packageName,
        latest: {},
        history: []
    };
    store.apps[packageName] = app;
}

const currentLatest = app.latest || {};
if (currentLatest.versionCode && versionCode <= currentLatest.versionCode) {
    console.error(`错误: 新版本号(${versionCode})必须大于当前版本号(${currentLatest.versionCode})`);
    process.exit(1);
}

if (currentLatest.versionCode) {
    app.history = app.history || [];
    app.history.unshift({
        ...currentLatest,
        releaseDate: new Date().toISOString().split('T')[0]
    });
}

app.latest = {
    versionName,
    versionCode,
    packageName,
    updateDescription,
    downloadUrl,
    forceUpdate
};

try {
    fs.writeFileSync(appVersionsPath, JSON.stringify(store, null, 2), 'utf8');
    console.log(`成功更新版本信息:`);
    console.log(`包名: ${packageName}`);
    console.log(`版本名: ${versionName}`);
    console.log(`版本号: ${versionCode}`);
    console.log(`强制更新: ${forceUpdate}`);
    console.log(`更新描述: ${updateDescription}`);
} catch (error) {
    console.error('保存版本数据失败:', error);
    process.exit(1);
}
