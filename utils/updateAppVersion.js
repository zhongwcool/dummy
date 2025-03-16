/**
 * 应用版本更新工具
 * 用法: node utils/updateAppVersion.js 1.0.2 3 "更新内容" "下载链接" [true/false]
 */

const fs = require('fs');
const path = require('path');

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length < 4) {
    console.log('用法: node updateAppVersion.js <版本名> <版本号> <更新描述> <下载链接> [强制更新]');
    console.log('示例: node updateAppVersion.js 1.0.2 3 "1.修复bug\\n2.优化性能" https://example.com/app.apk false');
    process.exit(1);
}

const versionName = args[0];
const versionCode = parseInt(args[1]);
const updateDescription = args[2];
const downloadUrl = args[3];
const forceUpdate = args[4] === 'true';

if (isNaN(versionCode) || versionCode <= 0) {
    console.error('错误: 版本号必须是正整数');
    process.exit(1);
}

// 读取现有版本数据
const appVersionsPath = path.join(__dirname, '../data/appVersions.json');
let appVersions;

try {
    const data = fs.readFileSync(appVersionsPath, 'utf8');
    appVersions = JSON.parse(data);
} catch (error) {
    console.error('读取版本数据失败:', error);
    process.exit(1);
}

// 获取当前最新版本
const currentLatest = appVersions.android.latest;

// 如果新版本号小于等于当前版本号，提示错误
if (versionCode <= currentLatest.versionCode) {
    console.error(`错误: 新版本号(${versionCode})必须大于当前版本号(${currentLatest.versionCode})`);
    process.exit(1);
}

// 将当前最新版本添加到历史记录中
if (currentLatest.versionCode) {
    currentLatest.releaseDate = new Date().toISOString().split('T')[0]; // 添加发布日期
    appVersions.android.history = appVersions.android.history || [];
    appVersions.android.history.unshift(currentLatest);
}

// 更新最新版本
const newVersion = {
    versionName,
    versionCode,
    updateDescription,
    downloadUrl,
    forceUpdate
};

appVersions.android.latest = newVersion;

// 保存更新后的版本数据
try {
    fs.writeFileSync(appVersionsPath, JSON.stringify(appVersions, null, 2), 'utf8');
    console.log(`成功更新Android版本信息:`);
    console.log(`版本名: ${versionName}`);
    console.log(`版本号: ${versionCode}`);
    console.log(`强制更新: ${forceUpdate}`);
    console.log(`更新描述: ${updateDescription}`);
} catch (error) {
    console.error('保存版本数据失败:', error);
    process.exit(1);
} 