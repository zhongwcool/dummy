# dummy

> 停止npm：Get-Process -Name node | Stop-Process -Force

Node.js + Express 实现简易测试api

## 简易图床

- 页面地址：`/image`（或 `/image.html`）
- 上传接口：`POST /api/image/upload`
- 列表接口：`GET /api/image/list`（按上传时间倒序）
- 删除接口：`DELETE /api/image/:filename`
- 字段名：`image`
- 限制：仅支持 `jpg/jpeg/png/gif/webp`，且单张图片不超过 `1MB`
- 上传成功后返回 `imageUrl`，可直接访问
- 图片展示：左侧默认按日期分组，组内按上传时间倒序

## 客户端统计

管理页：`/admin/stats`（需 admin 登录）

数据存在 SQLite 文件 `data/stats.db`（使用 Node.js 内置 `node:sqlite`，无需安装 `better-sqlite3`）。只保留每台设备的最后一条状态（按 `appId + deviceId` 覆盖更新），不存上报流水。首次上报会按 `appId` 自动建档；平台（Android / iOS / Windows / macOS / Linux）是设备字段，不编进产品 ID。

### 客户端上报

- `POST /api/stats/report`（公开，无需登录）
- 建议时机：每次冷启动一次；桌面长驻进程每 24 小时心跳一次；切换账号时补报一次
- 失败应静默忽略，不要影响客户端正常功能
- `deviceId` 由客户端首次启动生成 UUID 并持久化，不要用硬件 ID
- 兼容：多传的未知字段会被忽略；没出现的选填字段不会覆盖成空。要清空账号请显式传 `"account": ""`（退出登录）

```json
{
  "appId": "com.example.myapp",
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "platform": "android",
  "account": "alice",
  "versionName": "2.3.1",
  "versionCode": 231,
  "osVersion": "Android 14",
  "deviceModel": "Pixel 8",
  "arch": "arm64",
  "locale": "zh-CN",
  "channel": "official"
}
```

`platform` 仅允许：`android` / `ios` / `windows` / `mac` / `linux`。

### 管理接口（需 admin token）

- `GET /api/stats/products` - 产品列表
- `GET /api/stats/:appId/summary` - 概览（可加 `?platform=`）
- `GET /api/stats/:appId/devices` - 设备明细（`platform` / `version` / `account` / `page` / `pageSize`）
- `GET /api/stats/:appId/trend?days=30` - 日活趋势
- `PUT /api/stats/:appId` - 修改显示名 `{ "appName": "..." }`
- `DELETE /api/stats/:appId` - 删除该产品全部统计

## 运行必要条件

### 系统要求

- Node.js (v22.13.0 或更高版本，使用内置 sqlite)
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

## 开发说明

### 项目结构

```
project/
  ├── middleware/
  │   └── auth.js          # 认证相关中间件（验证token和角色）
  ├── utils/
  │   ├── fileHandler.js   # 文件操作工具（JSON数据读写）
  │   └── statsDb.js       # 客户端统计 SQLite
  ├── routes/
  │   ├── auth.js          # 认证路由（登录、登出、验证token）
  │   ├── users.js         # 用户管理路由
  │   └── stats.js         # 客户端统计上报与查询
  ├── data/
  │   ├── users.json       # 用户数据
  │   └── stats.db         # 客户端统计（git 忽略）
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
    - `statsDb.js` - 客户端统计 SQLite 读写与每日聚合

3. **routes/** - 路由目录
    - `auth.js` - 用户认证相关接口
    - `users.js` - 用户管理相关接口
    - `stats.js` - 客户端统计上报与管理查询

4. **data/** - 数据存储目录
    - `users.json` - 用户数据存储
    - `stats.db` - 客户端统计 SQLite

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