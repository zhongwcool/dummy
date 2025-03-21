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
        const page = req.query.page !== undefined ? parseInt(req.query.page) : undefined;
        const size = req.query.size !== undefined ? parseInt(req.query.size) : undefined;

        // 生成最多50天的完整预测数据集
        const allPredictions = generatePredictionsForStock(stock, 50);

        let pagePredictions = [];
        let validPage = 1;
        let limitedSize = 10;
        let totalPages = 1;

        // 参数为空，返回全部数据
        if (page === undefined && size === undefined) {
            pagePredictions = allPredictions;
            limitedSize = pagePredictions.length;
        }
        // 参数合法，返回分页数据
        else if (!isNaN(page) && page > 0 && !isNaN(size) && size > 0) {
            // 限制每页大小在1到50之间
            limitedSize = Math.min(Math.max(size, 1), 50);

            // 计算总页数
            totalPages = Math.ceil(allPredictions.length / limitedSize);

            // 验证页码有效性
            validPage = Math.min(Math.max(page, 1), totalPages);

            // 计算要返回的数据范围
            const startIndex = (validPage - 1) * limitedSize;
            const endIndex = Math.min(startIndex + limitedSize, allPredictions.length);

            // 获取当前页的数据
            pagePredictions = allPredictions.slice(startIndex, endIndex);
        }
        // 参数非法，返回空表
        else {
            pagePredictions = [];
        }

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

// 获取股票日常基础数据（所有已认证用户可访问）
router.get('/:id/daily-basics', verifyToken, async (req, res) => {
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
        const page = req.query.page !== undefined ? parseInt(req.query.page) : undefined;
        const size = req.query.size !== undefined ? parseInt(req.query.size) : undefined;

        // 生成最多50天的股票日常基础数据
        const allBasicsData = generateDailyBasicsForStock(stock, 50);

        let pageBasicsData = [];
        let validPage = 1;
        let limitedSize = 10;
        let totalPages = 1;

        // 参数为空，返回全部数据
        if (page === undefined && size === undefined) {
            pageBasicsData = allBasicsData;
            limitedSize = pageBasicsData.length;
        }
        // 参数合法，返回分页数据
        else if (!isNaN(page) && page > 0 && !isNaN(size) && size > 0) {
            // 限制每页大小在1到50之间
            limitedSize = Math.min(Math.max(size, 1), 50);

            // 计算总页数
            totalPages = Math.ceil(allBasicsData.length / limitedSize);

            // 验证页码有效性
            validPage = Math.min(Math.max(page, 1), totalPages);

            // 计算要返回的数据范围
            const startIndex = (validPage - 1) * limitedSize;
            const endIndex = Math.min(startIndex + limitedSize, allBasicsData.length);

            // 获取当前页的数据
            pageBasicsData = allBasicsData.slice(startIndex, endIndex);
        }
        // 参数非法，返回空表
        else {
            pageBasicsData = [];
        }

        res.json({
            items: pageBasicsData,
            total: allBasicsData.length,
            page: validPage,
            size: limitedSize,
            pages: totalPages
        });
    } catch (error) {
        console.error('Error getting stock daily basics:', error);
        res.status(500).json({
            success: false,
            message: '获取股票日常基础数据失败'
        });
    }
});

// 获取股票日常技术因子（所有已认证用户可访问）
router.get('/:id/daily-technical-factors', verifyToken, async (req, res) => {
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
        const page = req.query.page !== undefined ? parseInt(req.query.page) : undefined;
        const size = req.query.size !== undefined ? parseInt(req.query.size) : undefined;

        // 生成最多50天的股票技术因子数据
        const allTechnicalFactors = generateTechnicalFactorsForStock(stock, 50);

        let pageTechnicalFactors = [];
        let validPage = 1;
        let limitedSize = 10;
        let totalPages = 1;

        // 参数为空，返回全部数据
        if (page === undefined && size === undefined) {
            pageTechnicalFactors = allTechnicalFactors;
            limitedSize = pageTechnicalFactors.length;
        }
        // 参数合法，返回分页数据
        else if (!isNaN(page) && page > 0 && !isNaN(size) && size > 0) {
            // 限制每页大小在1到50之间
            limitedSize = Math.min(Math.max(size, 1), 50);

            // 计算总页数
            totalPages = Math.ceil(allTechnicalFactors.length / limitedSize);

            // 验证页码有效性
            validPage = Math.min(Math.max(page, 1), totalPages);

            // 计算要返回的数据范围
            const startIndex = (validPage - 1) * limitedSize;
            const endIndex = Math.min(startIndex + limitedSize, allTechnicalFactors.length);

            // 获取当前页的数据
            pageTechnicalFactors = allTechnicalFactors.slice(startIndex, endIndex);
        }
        // 参数非法，返回空表
        else {
            pageTechnicalFactors = [];
        }

        res.json({
            items: pageTechnicalFactors,
            total: allTechnicalFactors.length,
            page: validPage,
            size: limitedSize,
            pages: totalPages
        });
    } catch (error) {
        console.error('Error getting stock technical factors:', error);
        res.status(500).json({
            success: false,
            message: '获取股票技术因子数据失败'
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
 * 为股票生成日常基础数据
 * @param {Object} stock 股票对象
 * @param {number} days 天数
 * @returns {Array} 日常基础数据数组
 */
function generateDailyBasicsForStock(stock, days) {
    const dailyBasics = [];
    const currentDate = new Date();

    // 使用股票代码作为随机数种子，使同一股票每次生成的数据相同
    const seed = parseInt(stock.symbol.replace(/\D/g, '') || '123456');
    const prng = getPseudoRandomGenerator(seed);

    // 初始收盘价
    let lastClose = 50 + prng() * 150;

    for (let i = 0; i < days; i++) {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - i);

        // 生成当天开盘价（基于前一天收盘价的±2%）
        const open = lastClose * (1 + (prng() * 0.04 - 0.02));

        // 生成当天最高价（高于开盘价的0-5%）
        const high = open * (1 + prng() * 0.05);

        // 生成当天最低价（低于开盘价的0-5%）
        const low = open * (1 - prng() * 0.05);

        // 生成当天收盘价（最高价和最低价之间）
        const close = low + prng() * (high - low);

        // 前一天的收盘价
        const pre_close = i === 0 ? close * (1 + (prng() * 0.04 - 0.02)) : lastClose;

        // 更新lastClose为今天的收盘价，用于下一天计算
        lastClose = close;

        // 计算涨跌额
        const change = +(close - pre_close).toFixed(2);

        // 计算涨跌幅（百分比）
        const pct_chg = +((change / pre_close) * 100).toFixed(2);

        // 生成成交量（随机值，单位：手）
        const vol = +(prng() * 100000 + 10000).toFixed(0);

        // 生成成交额（成交量 * 收盘价，单位：元）
        const amount = +(vol * close).toFixed(2);

        dailyBasics.push({
            trade_date: date.toISOString().split('T')[0],
            open: +open.toFixed(2),
            high: +high.toFixed(2),
            low: +low.toFixed(2),
            close: +close.toFixed(2),
            pre_close: +pre_close.toFixed(2),
            change: change,
            pct_chg: pct_chg,
            vol: vol,
            amount: amount
        });
    }

    // 按日期降序排列
    return dailyBasics;
}

/**
 * 为股票生成技术因子数据
 * @param {Object} stock 股票对象
 * @param {number} days 天数
 * @returns {Array} 技术因子数据数组
 */
function generateTechnicalFactorsForStock(stock, days) {
    const technicalFactors = [];
    const currentDate = new Date();

    // 使用股票代码作为随机数种子，使同一股票每次生成的数据相同
    const seed = parseInt(stock.symbol.replace(/\D/g, '') || '123456');
    const prng = getPseudoRandomGenerator(seed);

    // 生成基础价格数据，用于计算均线
    const basePrices = [];
    let lastClose = 50 + prng() * 150;

    // 先生成足够多的历史数据用于计算均线（当前日期前的250天）
    for (let i = 0; i < days + 250; i++) {
        const open = lastClose * (1 + (prng() * 0.04 - 0.02));
        const high = open * (1 + prng() * 0.05);
        const low = open * (1 - prng() * 0.05);
        const close = low + prng() * (high - low);
        const pre_close = i === 0 ? close * (1 + (prng() * 0.04 - 0.02)) : lastClose;

        lastClose = close;

        basePrices.push({
            date: new Date(currentDate.getTime() - i * 86400000).toISOString().split('T')[0],
            open: open,
            high: high,
            low: low,
            close: close,
            pre_close: pre_close
        });
    }

    // 计算复权因子（假设为1.0，表示没有除权除息）
    const hfqFactor = 1.0;
    const qfqFactor = 1.0;

    // 生成近days天的技术因子数据
    for (let i = 0; i < days; i++) {
        const dateObj = new Date(currentDate);
        dateObj.setDate(dateObj.getDate() - i);
        const date = dateObj.toISOString().split('T')[0];

        // 获取当天的基础价格数据
        const dailyPrice = basePrices[i];

        // 计算前复权和后复权价格
        const open_hfq = +(dailyPrice.open * hfqFactor).toFixed(2);
        const open_qfq = +(dailyPrice.open * qfqFactor).toFixed(2);
        const high_hfq = +(dailyPrice.high * hfqFactor).toFixed(2);
        const high_qfq = +(dailyPrice.high * qfqFactor).toFixed(2);
        const low_hfq = +(dailyPrice.low * hfqFactor).toFixed(2);
        const low_qfq = +(dailyPrice.low * qfqFactor).toFixed(2);
        const close_hfq = +(dailyPrice.close * hfqFactor).toFixed(2);
        const close_qfq = +(dailyPrice.close * qfqFactor).toFixed(2);
        const pre_close = +dailyPrice.pre_close.toFixed(2);

        // 计算换手率
        const turnover_rate = +(prng() * 5).toFixed(2); // 0-5% 随机换手率
        const turnover_rate_f = +(turnover_rate * 0.8).toFixed(2); // 自由流通换手率稍低

        // 计算量比
        const volume_ratio = +(0.5 + prng() * 2).toFixed(2); // 0.5-2.5之间的量比

        // 计算均线数据
        function calculateMA(period) {
            let sum = 0;
            for (let j = i; j < i + period; j++) {
                if (j < basePrices.length) {
                    sum += basePrices[j].close * qfqFactor;
                }
            }
            return +(sum / period).toFixed(2);
        }

        const ma_qfq_5 = calculateMA(5);
        const ma_qfq_10 = calculateMA(10);
        const ma_qfq_20 = calculateMA(20);
        const ma_qfq_30 = calculateMA(30);
        const ma_qfq_60 = calculateMA(60);
        const ma_qfq_90 = calculateMA(90);
        const ma_qfq_250 = calculateMA(250);

        technicalFactors.push({
            trade_date: date,
            open_hfq: open_hfq,
            open_qfq: open_qfq,
            high_hfq: high_hfq,
            high_qfq: high_qfq,
            low_hfq: low_hfq,
            low_qfq: low_qfq,
            close_hfq: close_hfq,
            close_qfq: close_qfq,
            pre_close: pre_close,
            turnover_rate: turnover_rate,
            turnover_rate_f: turnover_rate_f,
            volume_ratio: volume_ratio,
            ma_qfq_5: ma_qfq_5,
            ma_qfq_10: ma_qfq_10,
            ma_qfq_20: ma_qfq_20,
            ma_qfq_30: ma_qfq_30,
            ma_qfq_60: ma_qfq_60,
            ma_qfq_90: ma_qfq_90,
            ma_qfq_250: ma_qfq_250
        });
    }

    // 按日期降序排列
    return technicalFactors;
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