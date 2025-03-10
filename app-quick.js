const express = require('express');
const app = express();
const PORT = 5000;

// 中间件：解析 JSON 请求体
app.use(express.json());

// 基础路由
app.get('/', (req, res) => {
    res.json({message: 'Server is running!'});
});

// 示例 API 路由
app.get('/api/users', (req, res) => {
    const users = [
        {id: 1, name: 'Alice'},
        {id: 2, name: 'Bob'}
    ];
    res.json(users);
});

app.post('/api/login', (req, res) => {
    const {username, password} = req.body;
    // 简单模拟登录逻辑
    if (username === 'admin' && password === '123456') {
        res.json({success: true, token: 'fake-jwt-token'});
    } else {
        res.status(401).json({success: false, message: 'Invalid credentials'});
    }
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({error: 'Endpoint not found'});
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({error: 'Something went wrong!'});
});

// 在 app.js 中添加
const cors = require('cors');
app.use(cors()); // 允许所有跨域请求

// 启动服务器
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

