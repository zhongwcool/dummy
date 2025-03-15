// utils/fileHandler.js
const fs = require('fs').promises;
const path = require('path');

// 数据文件路径
const DATA_FILES = {
    USERS: path.join(__dirname, '../data/users.json'),
    PRODUCTS: path.join(__dirname, '../data/products.json')
};

// 读取 JSON 文件
async function readJsonFile(filePath, defaultValue = null) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            // 如果文件不存在，返回默认值
            return defaultValue;
        }
        console.error(`Error reading file ${filePath}:`, error);
        return defaultValue;
    }
}

// 保存 JSON 文件
async function writeJsonFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 4));
        return true;
    } catch (error) {
        console.error(`Error writing file ${filePath}:`, error);
        return false;
    }
}

// 用户数据操作
const userDb = {
    read: async () => readJsonFile(DATA_FILES.USERS, {}),
    write: async (data) => writeJsonFile(DATA_FILES.USERS, data)
};

// 产品数据操作
const productDb = {
    read: async () => readJsonFile(DATA_FILES.PRODUCTS, []),
    write: async (data) => writeJsonFile(DATA_FILES.PRODUCTS, data)
};

module.exports = {
    DATA_FILES,
    userDb,
    productDb
}; 