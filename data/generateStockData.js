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
    {code: 'BABA', name: '阿里巴巴'},
    {code: '600519', name: '贵州茅台'},
    {code: '000858', name: '五粮液'},
    {code: '601318', name: '中国平安'},
    {code: '600036', name: '招商银行'},
    {code: '000333', name: '美的集团'},
    {code: '600276', name: '恒瑞医药'},
    {code: '601888', name: '中国中免'},
    {code: '000651', name: '格力电器'},
    {code: '601166', name: '兴业银行'},
    {code: 'TCEHY', name: '腾讯控股'},
    {code: '601398', name: '工商银行'},
    {code: '600887', name: '伊利股份'},
    {code: 'BIDU', name: '百度'},
    {code: 'PDD', name: '拼多多'},
    {code: '002594', name: '比亚迪'},
    {code: '600030', name: '中信证券'},
    {code: '601288', name: '农业银行'},
    {code: '000568', name: '泸州老窖'},
    {code: 'JD', name: '京东'},
    {code: '601899', name: '紫金矿业'},
    {code: '603259', name: '药明康德'},
    {code: '002475', name: '立讯精密'},
    {code: '600009', name: '上海机场'},
    {code: '000001', name: '平安银行'},
    {code: 'NIO', name: '蔚来汽车'},
    {code: '601857', name: '中国石油'},
    {code: '600309', name: '万华化学'},
    {code: 'NTES', name: '网易'},
    {code: '601988', name: '中国银行'},

    // Additional 70 stocks
    {code: '600585', name: '海螺水泥'},
    {code: '601238', name: '广汽集团'},
    {code: '601088', name: '中国神华'},
    {code: '600104', name: '上汽集团'},
    {code: '600048', name: '保利发展'},
    {code: '601668', name: '中国建筑'},
    {code: '601628', name: '中国人寿'},
    {code: '601601', name: '中国太保'},
    {code: '601818', name: '光大银行'},
    {code: '600028', name: '中国石化'},
    {code: '600809', name: '山西汾酒'},
    {code: '600690', name: '海尔智家'},
    {code: '601336', name: '新华保险'},
    {code: '601328', name: '交通银行'},
    {code: '600031', name: '三一重工'},
    {code: '002714', name: '牧原股份'},
    {code: '002352', name: '顺丰控股'},
    {code: '603799', name: '华友钴业'},
    {code: '600438', name: '通威股份'},
    {code: '603501', name: '韦尔股份'},
    {code: 'XPEV', name: '小鹏汽车'},
    {code: 'LI', name: '理想汽车'},
    {code: 'BILI', name: '哔哩哔哩'},
    {code: 'TME', name: '腾讯音乐'},
    {code: 'YUMC', name: '百胜中国'},
    {code: '000725', name: '京东方A'},
    {code: '002415', name: '海康威视'},
    {code: '601919', name: '中远海控'},
    {code: '600050', name: '中国联通'},
    {code: '600019', name: '宝钢股份'},
    {code: '600029', name: '南方航空'},
    {code: '600406', name: '国电南瑞'},
    {code: '601985', name: '中国核电'},
    {code: '601766', name: '中国中车'},
    {code: '600547', name: '山东黄金'},
    {code: '600660', name: '福耀玻璃'},
    {code: '601012', name: '隆基绿能'},
    {code: '600745', name: '闻泰科技'},
    {code: '600989', name: '宝丰能源'},
    {code: '601633', name: '长城汽车'},
    {code: '601229', name: '上海银行'},
    {code: '002271', name: '东方雨虹'},
    {code: '603986', name: '兆易创新'},
    {code: '601117', name: '中国化学'},
    {code: '002142', name: '宁波银行'},
    {code: '600754', name: '锦江酒店'},
    {code: '601111', name: '中国国航'},
    {code: '600600', name: '青岛啤酒'},
    {code: '600487', name: '亨通光电'},
    {code: '000776', name: '广发证券'},
    {code: '600999', name: '招商证券'},
    {code: '600196', name: '复星医药'},
    {code: '600011', name: '华能国际'},
    {code: '601688', name: '华泰证券'},
    {code: '002230', name: '科大讯飞'},
    {code: '600900', name: '长江电力'},
    {code: '000063', name: '中兴通讯'},
    {code: '000895', name: '双汇发展'},
    {code: '600115', name: '东方航空'},
    {code: '600893', name: '航发动力'},
    {code: '601211', name: '国泰君安'},
    {code: '601066', name: '中信建投'},
    {code: '600837', name: '海通证券'},
    {code: '603288', name: '海天味业'},
    {code: '002202', name: '金风科技'},
    {code: '600436', name: '片仔癀'},
    {code: '601225', name: '陕西煤业'},
    {code: '601865', name: '福莱特'},
    {code: '002841', name: '视源股份'},
    {code: '603899', name: '晨光文具'}
];

// Generate stock data entries for all stocks in the list
const stocks = stockNames.map((stock, index) => {
    const price = +(50 + Math.random() * 150).toFixed(2);
    const prediction = +(Math.random() * 2 - 1).toFixed(2); // Value between -1 and 1

    // Generate a date within the last 7 days
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * 7));
    date.setHours(Math.floor(Math.random() * 8) + 9); // Between 9 AM and 4 PM
    date.setMinutes(Math.floor(Math.random() * 60));
    date.setSeconds(Math.floor(Math.random() * 60));

    return {
        id: index + 1,
        code: stock.code,
        name: stock.name,
        prediction: prediction,
        price: price,
        publishTime: date.toISOString(),
        trendChart: `https://example.com/charts/${stock.code.toLowerCase()}.png`
    };
});

// Save to JSON file
const filePath = path.join(dataDir, 'stocks.json');
fs.writeFileSync(filePath, JSON.stringify(stocks, null, 2));

console.log(`Created ${stocks.length} stock records in ${filePath}`);