const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../public/files');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {recursive: true});
}

// 配置存储
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // 保持原始文件名，添加时间戳避免冲突
        const timestamp = Date.now();
        const originalName = path.basename(file.originalname, path.extname(file.originalname));
        const ext = path.extname(file.originalname);
        cb(null, originalName + '-' + timestamp + ext);
    }
});

// 文件过滤器，只允许上传APK文件
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/vnd.android.package-archive' ||
        path.extname(file.originalname).toLowerCase() === '.apk') {
        cb(null, true);
    } else {
        cb(new Error('只允许上传APK文件!'), false);
    }
};

// 创建multer实例
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 限制文件大小为100MB
    }
});

module.exports = upload; 