const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const upload = require('../middleware/imageUpload');

const router = express.Router();
const imageDir = path.join(__dirname, '../public/images');
const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

router.get('/list', (req, res) => {
    try {
        if (!fs.existsSync(imageDir)) {
            return res.json({images: []});
        }

        const files = fs.readdirSync(imageDir, {withFileTypes: true})
            .filter((item) => item.isFile())
            .map((item) => item.name);

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const images = files.map((filename) => {
            const fullPath = path.join(imageDir, filename);
            const stat = fs.statSync(fullPath);

            return {
                filename,
                url: `${baseUrl}/images/${filename}`,
                size: stat.size,
                uploadedAt: stat.birthtime.toISOString(),
                uploadedAtMs: stat.birthtimeMs
            };
        }).sort((a, b) => b.uploadedAtMs - a.uploadedAtMs)
            .map(({uploadedAtMs, ...rest}) => rest);

        return res.json({images});
    } catch (error) {
        return res.status(500).json({error: '获取图片列表失败'});
    }
});

router.post('/upload', (req, res) => {
    upload.single('image')(req, res, (err) => {
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

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const imageUrl = `${baseUrl}/images/${req.file.filename}`;

        return res.status(201).json({
            message: '上传成功',
            filename: req.file.filename,
            size: req.file.size,
            imageUrl
        });
    });
});

router.delete('/:filename', (req, res) => {
    try {
        const filename = path.basename(req.params.filename || '');
        const ext = path.extname(filename).toLowerCase();

        if (!filename || !allowedExts.has(ext)) {
            return res.status(400).json({error: '无效的文件名'});
        }

        const fullPath = path.join(imageDir, filename);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({error: '图片不存在'});
        }

        fs.unlinkSync(fullPath);
        return res.json({message: '删除成功'});
    } catch (error) {
        return res.status(500).json({error: '删除图片失败'});
    }
});

module.exports = router;
