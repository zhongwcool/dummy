// routes/products.js
const express = require('express');
const router = express.Router();
const {verifyToken, checkRole} = require('../middleware/auth');
const {productDb} = require('../utils/fileHandler');

// 获取产品列表（所有已认证用户可访问）
router.get('/', verifyToken, async (req, res) => {
    try {
        const products = await productDb.read();

        // 获取查询参数
        const page = req.query.page !== undefined ? parseInt(req.query.page) : undefined;
        const size = req.query.size !== undefined ? parseInt(req.query.size) : undefined;

        let paginatedProducts = [];

        // 参数为空，返回全部数据
        if (page === undefined && size === undefined) {
            paginatedProducts = products;
        }
        // 参数合法，返回分页数据
        else if (!isNaN(page) && page > 0 && !isNaN(size) && size > 0) {
            // 计算分页
            const startIndex = (page - 1) * size;
            const endIndex = startIndex + size;
            paginatedProducts = products.slice(startIndex, endIndex);
        }
        // 参数非法，返回空表
        else {
            paginatedProducts = [];
        }

        // 构造符合新格式的返回数据
        const currentDate = new Date().toISOString().split('T')[0];
        const formattedProducts = paginatedProducts.map(product => {
            return {
                trade_date: currentDate,
                prediction: +(Math.random() * 2 - 1).toFixed(4), // 模拟预测值
                price: +(50 + Math.random() * 150).toFixed(2), // 模拟价格
                stock_id: product.id,
                symbol: product.symbol,
                name: product.name
            };
        });

        res.json({
            items: formattedProducts,
            total: products.length,
            page: !isNaN(page) ? page : 1,
            size: !isNaN(size) ? size : formattedProducts.length,
            pages: !isNaN(size) && size > 0 ? Math.ceil(products.length / size) : 1
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
        const product = products.find(p => p.id === req.params.id || p.symbol === req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: '产品不存在'
            });
        }

        // 直接返回产品数据
        res.json(product);
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
        const {symbol, name, area, industry, exchange, list_date} = req.body;

        if (!symbol || !name) {
            return res.status(400).json({
                success: false,
                message: '产品代码和名称为必填项'
            });
        }

        const products = await productDb.read();
        const newProduct = {
            id: Date.now().toString(),
            symbol,
            name,
            area: area || '',
            industry: industry || '',
            exchange: exchange || '',
            list_date: list_date || new Date().toISOString().split('T')[0],
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
        const productIndex = products.findIndex(p => p.id === req.params.id || p.symbol === req.params.id);

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

        const {symbol, name, area, industry, exchange, list_date} = req.body;
        const updatedProduct = {
            ...products[productIndex],
            symbol: symbol || products[productIndex].symbol,
            name: name || products[productIndex].name,
            area: area || products[productIndex].area,
            industry: industry || products[productIndex].industry,
            exchange: exchange || products[productIndex].exchange,
            list_date: list_date || products[productIndex].list_date,
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
        const productIndex = products.findIndex(p => p.id === req.params.id || p.symbol === req.params.id);

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