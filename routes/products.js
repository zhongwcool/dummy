// routes/products.js
const express = require('express');
const router = express.Router();
const {verifyToken, checkRole} = require('../middleware/auth');
const {productDb} = require('../utils/fileHandler');

// 获取产品列表（所有已认证用户可访问）
router.get('/', verifyToken, async (req, res) => {
    try {
        const products = await productDb.read();

        // 检查是否有分页参数
        const page = req.query.page;
        const pageSize = req.query.pageSize;

        // 如果没有分页参数，返回全部数据
        if (!page && !pageSize) {
            return res.json({
                success: true,
                total: products.length,
                products: products
            });
        }

        // 有分页参数时，返回分页数据
        const currentPage = parseInt(page) || 1;
        const itemsPerPage = parseInt(pageSize) || 10;

        // 计算分页
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedProducts = products.slice(startIndex, endIndex);

        res.json({
            success: true,
            pagination: {
                total: products.length,
                page: currentPage,
                pageSize: itemsPerPage,
                totalPages: Math.ceil(products.length / itemsPerPage)
            },
            products: paginatedProducts
        });
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({
            success: false,
            message: '获取产品列表失败'
        });
    }
});

// 获取单个产品（所有已认证用户可访问）
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const products = await productDb.read();
        const product = products.find(p => p.id === req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: '产品不存在'
            });
        }

        res.json({
            success: true,
            product: product
        });
    } catch (error) {
        console.error('Error getting product:', error);
        res.status(500).json({
            success: false,
            message: '获取产品信息失败'
        });
    }
});

// 创建新产品（仅 admin 和 user 可访问）
router.post('/', verifyToken, checkRole(['admin', 'user']), async (req, res) => {
    try {
        const {name, description, price} = req.body;

        if (!name || !price) {
            return res.status(400).json({
                success: false,
                message: '产品名称和价格为必填项'
            });
        }

        const products = await productDb.read();
        const newProduct = {
            id: Date.now().toString(),
            name,
            description,
            price,
            created_by: req.user.username,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        products.push(newProduct);
        await productDb.write(products);

        res.status(201).json({
            success: true,
            product: newProduct,
            message: '产品创建成功'
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({
            success: false,
            message: '创建产品失败'
        });
    }
});

// 更新产品（仅 admin 和创建者可访问）
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const products = await productDb.read();
        const productIndex = products.findIndex(p => p.id === req.params.id);

        if (productIndex === -1) {
            return res.status(404).json({
                success: false,
                message: '产品不存在'
            });
        }

        // 检查权限：只有管理员或产品创建者可以更新
        if (req.user.role !== 'admin' && products[productIndex].created_by !== req.user.username) {
            return res.status(403).json({
                success: false,
                message: '权限不足'
            });
        }

        const {name, description, price} = req.body;
        const updatedProduct = {
            ...products[productIndex],
            name: name || products[productIndex].name,
            description: description || products[productIndex].description,
            price: price || products[productIndex].price,
            updated_at: new Date().toISOString()
        };

        products[productIndex] = updatedProduct;
        await productDb.write(products);

        res.json({
            success: true,
            product: updatedProduct,
            message: '产品更新成功'
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            success: false,
            message: '更新产品失败'
        });
    }
});

// 删除产品（仅 admin 可访问）
router.delete('/:id', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const products = await productDb.read();
        const productIndex = products.findIndex(p => p.id === req.params.id);

        if (productIndex === -1) {
            return res.status(404).json({
                success: false,
                message: '产品不存在'
            });
        }

        products.splice(productIndex, 1);
        await productDb.write(products);

        res.json({
            success: true,
            message: '产品删除成功'
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            message: '删除产品失败'
        });
    }
});

module.exports = router;