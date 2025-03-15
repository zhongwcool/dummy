# dummy

Node.js + Express 实现简易测试api

## 运行必要条件

### 系统要求

- Node.js (v12.0.0 或更高版本)
- npm (v6.0.0 或更高版本)

### 主要依赖

- Express.js (^4.21.2) - Web 应用框架
- CORS (^2.8.5) - 跨域资源共享中间件
- body-parser - 请求体解析中间件
- dotenv - 环境变量配置
- jsonwebtoken - JWT 认证
- bcryptjs - 密码加密
- morgan - HTTP 请求日志
- cookie-parser - Cookie 解析

## 安装和运行步骤

1. 克隆此仓库到本地
   ```bash
   git clone <仓库地址>
   cd dummy
   ```

2. 安装项目依赖
   ```bash
   npm install
   ```
3. 创建 `.env` 文件并配置环境变量
   可以使用 openssl 命令生成 JWT 密钥
   ```bash
   openssl rand -hex 32
   ```
   将生成的密钥添加到 `.env` 文件中
   ```text
   JWT_SECRET=your_generated_secret_key
   ```

4. 启动服务器
   ```bash
   # 使用标准版本
   node app.js
   ```
   服务器默认将在 http://localhost:5000 启动

## API 文档

### 用户认证

- POST /api/auth/login - 用户登录
- POST /api/auth/logout - 用户登出
- GET /api/auth/verify - 验证令牌

### 用户管理

- GET /api/users - 获取用户列表
- POST /api/users - 创建新用户
- PUT /api/users/:id - 更新用户信息
- DELETE /api/users/:id - 删除用户

### 产品管理

- GET /api/products - 获取产品列表
- POST /api/products - 创建新产品
- PUT /api/products/:id - 更新产品信息
- DELETE /api/products/:id - 删除产品

## 开发说明

### 项目结构

```
project/
  ├── middleware/
  │   └── auth.js          # 认证相关中间件（验证token和角色）
  ├── utils/
  │   └── fileHandler.js   # 文件操作工具（JSON数据读写）
  ├── routes/
  │   ├── auth.js          # 认证路由（登录、登出、验证token）
  │   ├── users.js         # 用户管理路由
  │   └── products.js      # 产品管理路由
  ├── data/
  │   ├── users.json       # 用户数据
  │   └── products.json    # 产品数据
  ├── app.js              # 应用主入口
  ├── package.json        # 项目配置
  ├── .env               # 环境变量配置
  └── README.md          # 项目说明文档
```

### 模块说明

1. **middleware/** - 中间件目录
    - `auth.js` - JWT token验证和角色权限控制

2. **utils/** - 工具函数目录
    - `fileHandler.js` - JSON文件数据库操作

3. **routes/** - 路由目录
    - `auth.js` - 用户认证相关接口
    - `users.js` - 用户管理相关接口
    - `products.js` - 产品管理相关接口

4. **data/** - 数据存储目录
    - `users.json` - 用户数据存储
    - `products.json` - 产品数据存储

### 环境变量配置

创建 `.env` 文件在项目根目录，包含以下配置：

```
# 服务器运行端口
PORT=5000

# 运行环境（development/production）
NODE_ENV=development

# JWT 密钥 - 用于用户认证token的加密和解密
# 生产环境中请使用足够长的随机字符串（至少32位）
# 示例：JWT_SECRET=your-random-secret-key-32-characters
JWT_SECRET=your_jwt_secret_key
```

> 注意：
> 1. `.env` 文件包含敏感信息，确保将其添加到 `.gitignore` 中
> 2. 不同环境（开发、测试、生产）应使用不同的 JWT_SECRET
> 3. 生产环境的 JWT_SECRET 应定期更换

## 问题反馈

如有问题或建议，请提交 Issue。

## 许可证

ISC