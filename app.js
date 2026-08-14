require('dotenv').config();
const os = require('os');
const https = require('https');
const express = require('express');
const cors = require('cors');
const path = require('path');
const isIp = require('is-ip');
const ipaddr = require('ipaddr.js');
const app = express();
const PORT = process.env.PORT || 5000;
// 获取当前环境，如果未设置则默认为开发环境
const NODE_ENV = process.env.NODE_ENV || 'production';

// Function to get the local IP address
function getLocalIPAddress() {
    const interfaces = os.networkInterfaces();
    let candidates = [];

    // 收集所有候选IP地址
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                try {
                    const addr = ipaddr.parse(iface.address);
                    if (addr.range() === 'private') {
                        candidates.push({
                            address: iface.address,
                            name: name,
                            // 优先选择192.168开头的地址
                            priority: iface.address.startsWith('192.168') ? 2 : 1
                        });
                    }
                } catch (e) {
                    console.error(`Error parsing IP address ${iface.address}:`, e);
                }
            }
        }
    }

    // 按优先级排序
    candidates.sort((a, b) => b.priority - a.priority);

    // 只在开发环境输出详细地址信息
    if (NODE_ENV === 'development') {
        console.log('可用的局域网IP地址:');
        candidates.forEach(c => console.log(`${c.name}: ${c.address} (优先级:${c.priority})`));
    }

    return candidates;
}

function fetchText(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {timeout: timeoutMs}, (resp) => {
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                resp.resume();
                reject(new Error(`HTTP ${resp.statusCode}`));
                return;
            }

            let data = '';
            resp.on('data', (chunk) => {
                data += chunk;
            });
            resp.on('end', () => resolve(data.trim()));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
        });
        req.on('error', reject);
    });
}

function extractIP(raw) {
    const trimmed = raw.trim();
    if (isIp(trimmed)) {
        return trimmed;
    }

    const contentTypeLooksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
    if (!contentTypeLooksJson) {
        throw new Error('non-JSON response');
    }

    const parsed = JSON.parse(trimmed);
    const ip = parsed.ip || parsed.origin;
    if (!ip || !isIp(ip)) {
        throw new Error('invalid IP in JSON');
    }
    return ip;
}

// Function to get the external IP address
async function getExternalIPAddress(callback) {
    const endpoints = [
        'https://api.ipify.org?format=json',
        'https://api.ipify.org',
        'https://icanhazip.com'
    ];

    for (const url of endpoints) {
        try {
            const ip = extractIP(await fetchText(url));
            if (NODE_ENV === 'development') {
                console.log(`获取到的外网IP地址: ${ip}`);
            }
            callback(ip);
            return;
        } catch (error) {
            if (NODE_ENV === 'development') {
                console.warn(`获取外网IP失败 (${url}): ${error.message}`);
            }
        }
    }

    callback('127.0.0.1');
}

// 中间件
app.use(cors()); // 允许所有跨域请求
app.use(express.json()); // 解析 JSON 请求体
app.use(express.urlencoded({extended: true})); // 解析 URL 编码的请求体

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/image', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'image.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin/apk', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-apk.html'));
});

app.get('/admin/users', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-users.html'));
});

app.get('/admin/images', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-images.html'));
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 导入路由
const userRouter = require('./routes/users');
const authRouter = require('./routes/auth');
const updateRouter = require('./routes/update');
const imageBedRouter = require('./routes/imageBed');

// 使用路由模块
app.use('/api/users', userRouter);
app.use('/api/auth', authRouter);
app.use('/api/update', updateRouter);
app.use('/api/image', imageBedRouter);

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
    const localIPs = getLocalIPAddress();
    getExternalIPAddress((ipAddress) => {
        console.log(`Server running on http://${ipAddress}:${PORT}`);
        localIPs.forEach(ip => {
            console.log(`Server running on http://${ip.address}:${PORT}`);
        });
    });
});