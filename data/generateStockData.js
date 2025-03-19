const fs = require('fs');
const path = require('path');

// Create the data directory if it doesn't exist
const dataDir = __dirname;
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// Stock names for Chinese market - expanded to 100 entries
const stockNames = [
    // Original 30 stocks
    {symbol: 'BABA', name: '阿里巴巴', area: '中国', industry: '电子商务', exchange: 'NYSE', list_date: '2014-09-19'},
    {symbol: '600519', name: '贵州茅台', area: '中国', industry: '白酒', exchange: 'SSE', list_date: '2001-08-27'},
    {symbol: '000858', name: '五粮液', area: '中国', industry: '白酒', exchange: 'SZSE', list_date: '1998-04-27'},
    {symbol: '601318', name: '中国平安', area: '中国', industry: '保险', exchange: 'SSE', list_date: '2007-03-01'},
    {symbol: '600036', name: '招商银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2002-04-09'},
    {symbol: '000333', name: '美的集团', area: '中国', industry: '家电', exchange: 'SZSE', list_date: '2013-09-18'},
    {symbol: '600276', name: '恒瑞医药', area: '中国', industry: '医药', exchange: 'SSE', list_date: '2000-10-16'},
    {symbol: '601888', name: '中国中免', area: '中国', industry: '零售', exchange: 'SSE', list_date: '2009-10-15'},
    {symbol: '000651', name: '格力电器', area: '中国', industry: '家电', exchange: 'SZSE', list_date: '1996-11-18'},
    {symbol: '601166', name: '兴业银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2007-02-05'},
    {symbol: 'TCEHY', name: '腾讯控股', area: '中国', industry: '互联网', exchange: 'OTC', list_date: '2004-06-16'},
    {symbol: '601398', name: '工商银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2006-10-27'},
    {symbol: '600887', name: '伊利股份', area: '中国', industry: '食品饮料', exchange: 'SSE', list_date: '1996-03-12'},
    {symbol: 'BIDU', name: '百度', area: '中国', industry: '互联网', exchange: 'NASDAQ', list_date: '2005-08-05'},
    {symbol: 'PDD', name: '拼多多', area: '中国', industry: '电子商务', exchange: 'NASDAQ', list_date: '2018-07-26'},
    {symbol: '002594', name: '比亚迪', area: '中国', industry: '汽车', exchange: 'SZSE', list_date: '2011-06-30'},
    {symbol: '600030', name: '中信证券', area: '中国', industry: '证券', exchange: 'SSE', list_date: '2003-01-06'},
    {symbol: '601288', name: '农业银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2010-07-15'},
    {symbol: '000568', name: '泸州老窖', area: '中国', industry: '白酒', exchange: 'SZSE', list_date: '1994-05-09'},
    {symbol: 'JD', name: '京东', area: '中国', industry: '电子商务', exchange: 'NASDAQ', list_date: '2014-05-22'},
    {symbol: '601899', name: '紫金矿业', area: '中国', industry: '矿业', exchange: 'SSE', list_date: '2008-04-25'},
    {symbol: '603259', name: '药明康德', area: '中国', industry: '医药', exchange: 'SSE', list_date: '2018-05-08'},
    {symbol: '002475', name: '立讯精密', area: '中国', industry: '电子', exchange: 'SZSE', list_date: '2010-09-15'},
    {symbol: '600009', name: '上海机场', area: '中国', industry: '交通', exchange: 'SSE', list_date: '1998-02-18'},
    {symbol: '000001', name: '平安银行', area: '中国', industry: '银行', exchange: 'SZSE', list_date: '1991-04-03'},
    {symbol: 'NIO', name: '蔚来汽车', area: '中国', industry: '汽车', exchange: 'NYSE', list_date: '2018-09-12'},
    {symbol: '601857', name: '中国石油', area: '中国', industry: '能源', exchange: 'SSE', list_date: '2007-11-05'},
    {symbol: '600309', name: '万华化学', area: '中国', industry: '化工', exchange: 'SSE', list_date: '2001-07-23'},
    {symbol: 'NTES', name: '网易', area: '中国', industry: '互联网', exchange: 'NASDAQ', list_date: '2000-06-30'},
    {symbol: '601988', name: '中国银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2006-07-05'},

    // Additional 70 stocks (全部更新为完整信息)
    {symbol: '600585', name: '海螺水泥', area: '中国', industry: '建材', exchange: 'SSE', list_date: '2002-02-07'},
    {symbol: '601238', name: '广汽集团', area: '中国', industry: '汽车', exchange: 'SSE', list_date: '2012-03-29'},
    {symbol: '601088', name: '中国神华', area: '中国', industry: '能源', exchange: 'SSE', list_date: '2007-10-09'},
    {symbol: '600104', name: '上汽集团', area: '中国', industry: '汽车', exchange: 'SSE', list_date: '1997-11-07'},
    {symbol: '600048', name: '保利发展', area: '中国', industry: '房地产', exchange: 'SSE', list_date: '2006-07-31'},
    {symbol: '601668', name: '中国建筑', area: '中国', industry: '建筑', exchange: 'SSE', list_date: '2009-07-29'},
    {symbol: '601628', name: '中国人寿', area: '中国', industry: '保险', exchange: 'SSE', list_date: '2007-01-09'},
    {symbol: '601601', name: '中国太保', area: '中国', industry: '保险', exchange: 'SSE', list_date: '2007-12-25'},
    {symbol: '601818', name: '光大银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2010-08-18'},
    {symbol: '600028', name: '中国石化', area: '中国', industry: '能源', exchange: 'SSE', list_date: '2001-08-08'},
    {symbol: '600809', name: '山西汾酒', area: '中国', industry: '白酒', exchange: 'SSE', list_date: '1996-08-19'},
    {symbol: '600690', name: '海尔智家', area: '中国', industry: '家电', exchange: 'SSE', list_date: '1993-11-19'},
    {symbol: '601336', name: '新华保险', area: '中国', industry: '保险', exchange: 'SSE', list_date: '2011-12-16'},
    {symbol: '601328', name: '交通银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2007-05-15'},
    {symbol: '600031', name: '三一重工', area: '中国', industry: '机械', exchange: 'SSE', list_date: '2003-07-03'},
    {symbol: '002714', name: '牧原股份', area: '中国', industry: '农业', exchange: 'SZSE', list_date: '2014-01-28'},
    {symbol: '002352', name: '顺丰控股', area: '中国', industry: '物流', exchange: 'SZSE', list_date: '2010-02-05'},
    {symbol: '603799', name: '华友钴业', area: '中国', industry: '有色金属', exchange: 'SSE', list_date: '2015-01-29'},
    {symbol: '600438', name: '通威股份', area: '中国', industry: '农业', exchange: 'SSE', list_date: '2004-06-24'},
    {symbol: '603501', name: '韦尔股份', area: '中国', industry: '半导体', exchange: 'SSE', list_date: '2017-05-04'},
    {symbol: 'XPEV', name: '小鹏汽车', area: '中国', industry: '汽车', exchange: 'NYSE', list_date: '2020-08-27'},
    {symbol: 'LI', name: '理想汽车', area: '中国', industry: '汽车', exchange: 'NASDAQ', list_date: '2020-07-30'},
    {symbol: 'BILI', name: '哔哩哔哩', area: '中国', industry: '娱乐', exchange: 'NASDAQ', list_date: '2018-03-28'},
    {symbol: 'TME', name: '腾讯音乐', area: '中国', industry: '娱乐', exchange: 'NYSE', list_date: '2018-12-12'},
    {symbol: 'YUMC', name: '百胜中国', area: '中国', industry: '餐饮', exchange: 'NYSE', list_date: '2016-11-01'},
    {symbol: '000725', name: '京东方A', area: '中国', industry: '电子', exchange: 'SZSE', list_date: '1997-05-08'},
    {symbol: '002415', name: '海康威视', area: '中国', industry: '电子', exchange: 'SZSE', list_date: '2010-05-28'},
    {symbol: '601919', name: '中远海控', area: '中国', industry: '航运', exchange: 'SSE', list_date: '2007-12-26'},
    {symbol: '600050', name: '中国联通', area: '中国', industry: '通信', exchange: 'SSE', list_date: '2002-10-09'},
    {symbol: '600019', name: '宝钢股份', area: '中国', industry: '钢铁', exchange: 'SSE', list_date: '2000-12-12'},
    {symbol: '600029', name: '南方航空', area: '中国', industry: '航空', exchange: 'SSE', list_date: '2003-07-25'},
    {symbol: '600406', name: '国电南瑞', area: '中国', industry: '电力设备', exchange: 'SSE', list_date: '2004-05-12'},
    {symbol: '601985', name: '中国核电', area: '中国', industry: '电力', exchange: 'SSE', list_date: '2015-06-10'},
    {symbol: '601766', name: '中国中车', area: '中国', industry: '机械设备', exchange: 'SSE', list_date: '2008-08-18'},
    {symbol: '600547', name: '山东黄金', area: '中国', industry: '黄金', exchange: 'SSE', list_date: '2003-08-28'},
    {
        symbol: '600660',
        name: '福耀玻璃',
        area: '中国',
        industry: '汽车零部件',
        exchange: 'SSE',
        list_date: '1993-06-10'
    },
    {symbol: '601012', name: '隆基绿能', area: '中国', industry: '光伏', exchange: 'SSE', list_date: '2012-04-11'},
    {symbol: '600745', name: '闻泰科技', area: '中国', industry: '电子', exchange: 'SSE', list_date: '1996-03-13'},
    {symbol: '600989', name: '宝丰能源', area: '中国', industry: '煤炭', exchange: 'SSE', list_date: '2019-05-16'},
    {symbol: '601633', name: '长城汽车', area: '中国', industry: '汽车', exchange: 'SSE', list_date: '2011-09-28'},
    {symbol: '601229', name: '上海银行', area: '中国', industry: '银行', exchange: 'SSE', list_date: '2016-11-16'},
    {symbol: '002271', name: '东方雨虹', area: '中国', industry: '建材', exchange: 'SZSE', list_date: '2008-09-25'},
    {symbol: '603986', name: '兆易创新', area: '中国', industry: '半导体', exchange: 'SSE', list_date: '2016-08-18'},
    {symbol: '601117', name: '中国化学', area: '中国', industry: '建筑', exchange: 'SSE', list_date: '2010-01-14'},
    {symbol: '002142', name: '宁波银行', area: '中国', industry: '银行', exchange: 'SZSE', list_date: '2007-07-19'},
    {symbol: '600754', name: '锦江酒店', area: '中国', industry: '酒店', exchange: 'SSE', list_date: '1996-01-11'},
    {symbol: '601111', name: '中国国航', area: '中国', industry: '航空', exchange: 'SSE', list_date: '2006-12-18'},
    {symbol: '600600', name: '青岛啤酒', area: '中国', industry: '酒类', exchange: 'SSE', list_date: '1993-08-27'},
    {symbol: '600487', name: '亨通光电', area: '中国', industry: '通信设备', exchange: 'SSE', list_date: '2003-09-24'},
    {symbol: '000776', name: '广发证券', area: '中国', industry: '证券', exchange: 'SZSE', list_date: '1997-04-09'},
    {symbol: '600999', name: '招商证券', area: '中国', industry: '证券', exchange: 'SSE', list_date: '2009-11-17'},
    {symbol: '600196', name: '复星医药', area: '中国', industry: '医药', exchange: 'SSE', list_date: '1998-08-07'},
    {symbol: '600011', name: '华能国际', area: '中国', industry: '电力', exchange: 'SSE', list_date: '2001-12-06'},
    {symbol: '601688', name: '华泰证券', area: '中国', industry: '证券', exchange: 'SSE', list_date: '2010-02-26'},
    {symbol: '002230', name: '科大讯飞', area: '中国', industry: '软件', exchange: 'SZSE', list_date: '2008-05-12'},
    {symbol: '600900', name: '长江电力', area: '中国', industry: '电力', exchange: 'SSE', list_date: '2003-11-18'},
    {symbol: '000063', name: '中兴通讯', area: '中国', industry: '通信设备', exchange: 'SZSE', list_date: '1997-11-18'},
    {symbol: '000895', name: '双汇发展', area: '中国', industry: '食品加工', exchange: 'SZSE', list_date: '1998-12-10'},
    {symbol: '600115', name: '东方航空', area: '中国', industry: '航空', exchange: 'SSE', list_date: '1997-11-05'},
    {symbol: '600893', name: '航发动力', area: '中国', industry: '航空', exchange: 'SSE', list_date: '1998-06-03'},
    {symbol: '601211', name: '国泰君安', area: '中国', industry: '证券', exchange: 'SSE', list_date: '2015-06-26'},
    {symbol: '601066', name: '中信建投', area: '中国', industry: '证券', exchange: 'SSE', list_date: '2018-06-20'},
    {symbol: '600837', name: '海通证券', area: '中国', industry: '证券', exchange: 'SSE', list_date: '1994-02-24'},
    {symbol: '603288', name: '海天味业', area: '中国', industry: '食品', exchange: 'SSE', list_date: '2014-02-11'},
    {symbol: '002202', name: '金风科技', area: '中国', industry: '电气设备', exchange: 'SZSE', list_date: '2007-12-26'},
    {symbol: '600436', name: '片仔癀', area: '中国', industry: '中药', exchange: 'SSE', list_date: '2003-06-16'},
    {symbol: '601225', name: '陕西煤业', area: '中国', industry: '煤炭', exchange: 'SSE', list_date: '2014-01-28'},
    {symbol: '601865', name: '福莱特', area: '中国', industry: '玻璃', exchange: 'SSE', list_date: '2019-02-15'},
    {symbol: '002841', name: '视源股份', area: '中国', industry: '电子', exchange: 'SZSE', list_date: '2017-01-19'},
    {symbol: '603899', name: '晨光文具', area: '中国', industry: '文具', exchange: 'SSE', list_date: '2015-01-27'}
];

// Generate stock data entries for all stocks in the list
const stocks = stockNames.map((stock, index) => {
    // 处理旧格式数据转换为新格式
    const symbol = stock.symbol || stock.code;
    const area = stock.area || '中国';
    const industry = stock.industry || '';
    const exchange = stock.exchange || (symbol.length <= 6 ? 'SSE' : 'NASDAQ');
    const list_date = stock.list_date || '2020-01-01';

    return {
        id: symbol,
        symbol: symbol,
        name: stock.name,
        area: area,
        industry: industry,
        exchange: exchange,
        list_date: list_date
    };
});

// Save to JSON file
const filePath = path.join(dataDir, 'stocks.json');
fs.writeFileSync(filePath, JSON.stringify(stocks, null, 2));

console.log(`Created ${stocks.length} stock records in ${filePath}`);