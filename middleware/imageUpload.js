const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/images');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {recursive: true});
}

const RANDOM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateRandomName(length = 7) {
    let result = '';
    for (let i = 0; i < length; i++) {
        const index = Math.floor(Math.random() * RANDOM_CHARS.length);
        result += RANDOM_CHARS[index];
    }
    return result;
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        let filename = `${generateRandomName(7)}${ext}`;

        // 极小概率重名时重新生成，避免覆盖已有文件
        while (fs.existsSync(path.join(uploadDir, filename))) {
            filename = `${generateRandomName(7)}${ext}`;
        }

        cb(null, filename);
    }
});

const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && allowedExts.has(ext)) {
        cb(null, true);
        return;
    }
    cb(new Error('只允许上传 jpg/jpeg/png/gif/webp 图片'), false);
};

module.exports = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 1 * 1024 * 1024
    }
});
