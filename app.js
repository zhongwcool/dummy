const os = require('os');
const http = require('http');
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;
// 获取当前环境，如果未设置则默认为开发环境
const NODE_ENV = process.env.NODE_ENV || 'production';

// 日志工具函数
function print(message) {
    // 只在开发环境打印非错误日志
    if (NODE_ENV === 'development') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${message}`);
    }
}

// Function to get the local IP address
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    let candidates = [];

    // 收集所有候选IP地址
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                candidates.push({
                    address: iface.address,
                    name: name,
                    // 优先选择192.168开头的地址
                    priority: iface.address.startsWith('192.168') ? 2 : 1
                });
            }
        }
    }

    // 按优先级排序
    candidates.sort((a, b) => b.priority - a.priority);

    // 输出所有找到的地址便于调试
    print('可用的局域网IP地址:');
    candidates.forEach(c => print(`${c.name}: ${c.address} (优先级:${c.priority})`));

    return candidates.length > 0 ? candidates[0].address : '127.0.0.1';
}

// Function to get the external IP address
function getExternalIPAddress(callback) {
    http.get('http://httpbin.org/ip', (resp) => {
        let data = '';

        // A chunk of data has been received.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received.
        resp.on('end', () => {
            const ip = JSON.parse(data).origin;
            callback(ip);
        });

    }).on('error', (err) => {
        console.error(`Error fetching IP address:${err.message}`);
        callback('127.0.0.1'); // Fallback to localhost if error occurs
    });
}

// 中间件
app.use(cors()); // 允许所有跨域请求
app.use(express.json()); // 解析 JSON 请求体

// 导入路由
const userRouter = require('./routes/users');
const productRouter = require('./routes/products');
const authRouter = require('./routes/auth');
const updateRouter = require('./routes/update');

// 基础路由
app.get('/', (req, res) => {
    res.json({
        message: 'API Server is running!',
        endpoints: {
            users: '/api/users',
            products: '/api/products',
            auth: '/api/auth',
            update: '/api/update'
        }
    });
});

// 使用路由模块
app.use('/api/users', userRouter);
app.use('/api/products', productRouter);
app.use('/api/auth', authRouter);
app.use('/api/update', updateRouter);

// 404 处理
app.use((req, res) => {
    res.status(404).json({error: 'Endpoint not found'});
});

// 错误处理
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({error: 'Something went wrong!'});
});

// 启动服务器
app.listen(PORT, () => {
    const localIPAddress = getLocalIPAddress();
    getExternalIPAddress((ipAddress) => {
        console.log(`Server running on http://${ipAddress}:${PORT}`);
        console.log(`Server running on http://${localIPAddress}:${PORT}`);
    });
});