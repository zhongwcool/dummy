# dummy

> 停止npm：Get-Process -Name node | Stop-Process -Force

Node.js + Express 实现简易测试api

## 简易图床

- 公开页：`/image`（或 `/image.html`）
- 管理页：`/admin/image`（需登录）
- 上传接口：`POST /api/image/upload`
- 列表接口：`GET /api/image/list`（按上传时间倒序）
- 删除接口：`DELETE /api/image/:filename`
- 字段名：`image`
- 限制：仅支持 `jpg/jpeg/png/gif/webp`，且单张图片不超过 `1MB`
- 上传成功后返回 `imageUrl`，可直接访问
- 图片展示：左侧默认按日期分组，组内按上传时间倒序

## 客户端统计

管理页：`/admin/stats`（需 admin 登录）

数据在 `data/app.db`（见下方「数据存储」）。已登录按 `appId + account` 一行，未登录按 `deviceId` 一行。打开次数按自然日写入；心跳（`event=heartbeat`）不计次。

**客户端接入（Android / Windows 等）见 [docs/client-stats.md](docs/client-stats.md)。** 在其它仓库改客户端时，Cursor 使用个人 skill `client-stats-report`。

### 管理接口（需 admin token）

- `GET /api/stats/products` - 产品列表
- `GET /api/stats/:appId/summary` - 概览（可加 `?platform=`，含日/周/月打开次数）
- `GET /api/stats/:appId/devices` - 明细（`platform` / `version` / `q` / `page` / `pageSize`，`q` 搜 IP / 机型 / 账号 / deviceId）
- `GET /api/stats/:appId/devices/:deviceId/daily?days=30` - 单设备每日打开次数
- `GET /api/stats/:appId/trend?days=30` - 日活与打开次数趋势
- `PUT /api/stats/:appId` - 修改显示名 `{ "appName": "..." }`
- `DELETE /api/stats/:appId` - 删除该产品全部统计

## 数据存储

账号、应用版本、客户端统计都在同一个 SQLite 库 `data/app.db`（Node 内置 `node:sqlite`，WAL 模式）。连接与建表统一在 `utils/db.js`，业务模块只通过它读写：

| 表                                                  | 用途                                                              | 访问模块           |
|-----------------------------------------------------|-------------------------------------------------------------------|--------------------|
| `users`                                             | 后台账号（bcrypt 密码、角色、最后登录）                           | `utils/usersDb.js` |
| `apps`                                              | 应用商店的应用（包名、显示名、logo / banner）                     | `utils/appsDb.js`  |
| `app_versions`                                      | 每个应用的版本记录，`version_code` 最大者即最新版                 | `utils/appsDb.js`  |
| `products`                                          | 客户端统计的产品档案，按上报的 appId 自动建档，与 `apps` 互不影响 | `utils/statsDb.js` |
| `devices` / `daily_stats` / `device_daily` / `meta` | 客户端统计                                                        | `utils/statsDb.js` |

APK 与图片本体仍是磁盘文件（`public/files/`、`public/app-assets/`），库里只存地址。

**从旧版本升级**：首次启动时自动完成，无需手工操作。

- `data/stats.db` 会 checkpoint 后改名为 `data/app.db`，原有统计表原样保留；
- 若曾把统计产品并进 `apps` 表，启动时会拆回独立的 `products` 表，商店只留下有版本的应用；
- `data/users.json`、`data/appVersions.json` 导入对应表后改名为 `*.json.migrated`，确认无误后可删除；
- 若 `users` 表仍为空（全新部署），会创建默认管理员 `admin` / `admin`。请登录后尽快改密。不能删除或降级库里最后一个 admin 角色；
- 升级前请先停掉旧进程，否则 Windows 下改名会因文件被占用而失败。

可用环境变量 `DATA_DIR` 指定数据目录（默认 `./data`）。备份时不要直接复制 `app.db`（WAL 模式下部分数据还在 `-wal` 文件里），用 `sqlite3 data/app.db ".backup backup.db"` 或先停服再复制整个 `data/` 目录。

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

- GET /api/users - 获取用户列表（含 `canDelete` / `isLastAdmin`）
- POST /api/users - 创建新用户
- PUT /api/users/:username - 更新用户信息（不能取消最后一个管理员）
- DELETE /api/users/:username - 删除用户（不能删除当前登录账号或最后一个管理员）

## 开发说明

### 项目结构

```
project/
  ├── middleware/
  │   └── auth.js          # 认证相关中间件（验证token和角色）
  ├── utils/
  │   ├── db.js            # SQLite 连接、建表、旧数据迁移
  │   ├── usersDb.js       # 账号读写
  │   ├── appsDb.js        # 应用与版本读写
  │   └── statsDb.js       # 客户端统计读写与每日聚合
  ├── routes/
  │   ├── auth.js          # 认证路由（登录、登出、验证token）
  │   ├── users.js         # 用户管理路由
  │   ├── update.js        # 应用版本发布与更新检查
  │   └── stats.js         # 客户端统计上报与查询
  ├── data/
  │   └── app.db           # 全部业务数据（git 忽略）
  ├── app.js              # 应用主入口
  ├── package.json        # 项目配置
  ├── .env               # 环境变量配置
  └── README.md          # 项目说明文档
```

### 模块说明

1. **middleware/** - 中间件目录
    - `auth.js` - JWT token验证和角色权限控制

2. **utils/** - 工具函数目录
    - `db.js` - 统一 SQLite 连接、建表与旧 JSON / stats.db 迁移
    - `usersDb.js` - 账号数据访问
    - `appsDb.js` - 应用与版本数据访问
    - `statsDb.js` - 客户端统计读写与每日聚合

3. **routes/** - 路由目录
    - `auth.js` - 用户认证相关接口
    - `users.js` - 用户管理相关接口
    - `update.js` - 应用版本发布与更新检查
    - `stats.js` - 客户端统计上报与管理查询

4. **data/** - 数据存储目录
    - `app.db` - 全部业务数据（SQLite，见「数据存储」）

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