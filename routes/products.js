// routes/products.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// 获取产品列表
router.get('/', (req, res) => {
    try {
        // 从JSON文件读取数据
        const filePath = path.join(__dirname, '..', 'data', 'stocks.json');
        const stockData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // 随机选择10条记录
        const shuffled = [...stockData].sort(() => 0.5 - Math.random());
        const selectedStocks = shuffled.slice(0, 10);

        res.json(selectedStocks);
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