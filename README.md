# dummy
Node.js + Express 实现简易测试api

## 功能特性

- 用户认证 (登录/登出/验证令牌)
- 用户管理 API 
- 产品管理 API
- 跨域请求支持 (CORS)

## 运行必要条件

### 系统要求
- Node.js (v12.0.0 或更高版本)
- npm (v6.0.0 或更高版本)

### 主要依赖
- Express.js - Web 应用框架
- CORS - 跨域资源共享中间件

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

3. 启动服务器
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
dummy/
  ├── node_modules/          # 项目依赖
  ├── routes/               # 路由文件
  │   ├── auth.js          # 认证相关路由
  │   ├── users.js         # 用户管理路由
  │   └── products.js      # 产品管理路由
  ├── app.js               # 主应用入口
  ├── package.json         # 项目配置文件
  ├── package-lock.json    # 依赖版本锁定文件
  └── README.md           # 项目说明文档
```

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