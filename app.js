const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 5000;

// 中间件
app.use(cors()); // 允许所有跨域请求
app.use(express.json()); // 解析 JSON 请求体

// 导入路由
const userRouter = require('./routes/users');
const productRouter = require('./routes/products');
const authRouter = require('./routes/auth');

// 基础路由
app.get('/', (req, res) => {
    res.json({
        message: 'API Server is running!',
        endpoints: {
            users: '/api/users',
            products: '/api/products',
            auth: '/api/auth'
        }
    });
});

// 使用路由模块
app.use('/api/users', userRouter);
app.use('/api/products', productRouter);
app.use('/api/auth', authRouter);

// 404 处理
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});