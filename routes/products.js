// routes/products.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 获取产品列表 - 支持分页
router.get('/', (req, res) => {
    try {
        // 获取分页参数，默认页码为1，每页10条
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        // 计算起始索引
        const startIndex = (page - 1) * pageSize;

        // 从JSON文件读取数据
        const filePath = path.join(__dirname, '..', 'data', 'stocks.json');
        const stockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // 分页获取数据
        const paginatedStocks = stockData.slice(startIndex, startIndex + pageSize);

        // 返回分页数据和元信息
        res.json({
            stocks: paginatedStocks,
            pagination: {
                total: stockData.length,
                page: page,
                pageSize: pageSize,
                totalPages: Math.ceil(stockData.length / pageSize)
            }
        });
    } catch (error) {
        console.error('Error reading stock data:', error);
        res.status(500).json({error: 'Failed to retrieve stock data'});
    }
});

// 获取单个产品详情
router.get('/:id', (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const filePath = path.join(__dirname, '..', 'data', 'stocks.json');
        const stockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const stock = stockData.find(s => s.id === id);

        if (stock) {
            res.json(stock);
        } else {
            res.status(404).json({error: 'Stock not found'});
        }
    } catch (error) {
        console.error('Error retrieving stock:', error);
        res.status(500).json({error: 'Failed to retrieve stock data'});
    }
});

module.exports = router;