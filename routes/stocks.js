const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middleware/auth');
const {productDb} = require('../utils/fileHandler');

// 获取股票列表（所有已认证用户可访问）
router.get('/', verifyToken, async (req, res) => {
    try {
        const stocks = await productDb.read();

        // 获取查询参数
        const page = req.query.page !== undefined ? parseInt(req.query.page) : undefined;
        const size = req.query.size !== undefined ? parseInt(req.query.size) : undefined;

        let paginatedStocks = [];

        // 参数为空，返回全部数据
        if (page === undefined && size === undefined) {
            paginatedStocks = stocks;
        }
        // 参数合法，返回分页数据
        else if (!isNaN(page) && page > 0 && !isNaN(size) && size > 0) {
            // 计算分页
            const startIndex = (page - 1) * size;
            const endIndex = startIndex + size;
            paginatedStocks = stocks.slice(startIndex, endIndex);
        }
        // 参数非法，返回空表
        else {
            paginatedStocks = [];
        }

        // 构造符合新格式的返回数据
        const currentDate = new Date().toISOString().split('T')[0];
        const formattedStocks = paginatedStocks.map(stock => {
            return {
                trade_date: currentDate,
                prediction: +(Math.random() * 2 - 1).toFixed(4), // 模拟预测值
                price: +(50 + Math.random() * 150).toFixed(2), // 模拟价格
                stock_id: stock.id,
                symbol: stock.symbol,
                name: stock.name
            };
        });

        res.json({
            items: formattedStocks,
            total: stocks.length,
            page: !isNaN(page) ? page : 1,
            size: !isNaN(size) ? size : formattedStocks.length,
            pages: !isNaN(size) && size > 0 ? Math.ceil(stocks.length / size) : 1
        });
    } catch (error) {
        console.error('Error getting stocks:', error);
        res.status(500).json({
            success: false,
            message: '获取股票列表失败'
        });
    }
});

// 获取单个股票（所有已认证用户可访问）
router.get('/:id', verifyToken, async (req, res) => {
    try {
        const stocks = await productDb.read();
        const stock = stocks.find(p => p.id === req.params.id || p.symbol === req.params.id);

        if (!stock) {
            return res.status(404).json({
                success: false,
                message: '股票不存在'
            });
        }

        // 返回简化的股票数据，符合要求的格式
        res.json({
            symbol: stock.symbol,
            name: stock.name,
            area: stock.area,
            industry: stock.industry,
            exchange: stock.exchange,
            list_date: stock.list_date
        });
    } catch (error) {
        console.error('Error getting stock:', error);
        res.status(500).json({
            success: false,
            message: '获取股票信息失败'
        });
    }
});

// 获取股票预测数据（所有已认证用户可访问）
router.get('/:id/predictions', verifyToken, async (req, res) => {
    try {
        const stocks = await productDb.read();
        const stock = stocks.find(p => p.id === req.params.id || p.symbol === req.params.id);

        if (!stock) {
            return res.status(404).json({
                success: false,
                message: '股票不存在'
            });
        }

        // 获取查询参数
        const page = parseInt(req.query.page) || 1;
        const size = parseInt(req.query.size) || 10; // 默认返回10天数据

        // 限制每页大小在1到50之间
        const limitedSize = Math.min(Math.max(size, 1), 50);

        // 生成最多50天的完整预测数据集
        const allPredictions = generatePredictionsForStock(stock, 50);

        // 计算总页数
        const totalPages = Math.ceil(allPredictions.length / limitedSize);

        // 验证页码有效性
        const validPage = Math.min(Math.max(page, 1), totalPages);

        // 计算要返回的数据范围
        const startIndex = (validPage - 1) * limitedSize;
        const endIndex = Math.min(startIndex + limitedSize, allPredictions.length);

        // 获取当前页的数据
        const pagePredictions = allPredictions.slice(startIndex, endIndex);

        res.json({
            items: pagePredictions,
            total: allPredictions.length,
            page: validPage,
            size: limitedSize,
            pages: totalPages
        });
    } catch (error) {
        console.error('Error getting stock predictions:', error);
        res.status(500).json({
            success: false,
            message: '获取股票预测数据失败'
        });
    }
});

/**
 * 为股票生成连续的预测数据
 * @param {Object} stock 股票对象
 * @param {number} days 天数
 * @returns {Array} 预测数据数组
 */
function generatePredictionsForStock(stock, days) {
    const predictions = [];
    const currentDate = new Date();

    // 使用股票代码作为随机数种子，使同一股票每次生成的数据相同
    const seed = parseInt(stock.symbol.replace(/\D/g, '') || '123456');
    const prng = getPseudoRandomGenerator(seed);

    // 初始价格和预测值
    let lastPrice = 50 + prng() * 150;
    let lastPrediction = prng() * 2 - 1;

    for (let i = 0; i < days; i++) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - i);

        // 根据上一天的价格生成今天的价格，保持连续性
        // 价格波动范围为前一天的 ±5%
        const priceChange = (prng() * 0.1 - 0.05) * lastPrice;
        const price = Math.max(1, lastPrice + priceChange);
        lastPrice = price;

        // 预测值在 -1 到 1 之间波动，与前一天有一定关联
        const predictionChange = prng() * 0.4 - 0.2;
        let prediction = lastPrediction + predictionChange;
        // 确保预测值在 -1 到 1 之间
        prediction = Math.max(-1, Math.min(1, prediction));
        lastPrediction = prediction;

        predictions.push({
            trade_date: date.toISOString().split('T')[0],
            prediction: +prediction.toFixed(4),
            price: +price.toFixed(2)
        });
    }

    // 按日期降序排列
    return predictions;
}

/**
 * 创建一个伪随机数生成器，确保同样的种子产生同样的随机序列
 * @param {number} seed 随机种子
 * @returns {Function} 返回0-1之间的随机数的函数
 */
function getPseudoRandomGenerator(seed) {
    return function () {
        // 简单的伪随机数算法
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
}

module.exports = router; 