# APK版本管理系统

这是一个简单的APK版本管理系统，允许用户上传APK文件，管理版本信息，并提供下载链接。

## 功能特点

- 上传APK文件并自动更新版本信息
- 查看最新版本和历史版本
- 提供版本检查API，用于客户端检查更新
- 支持强制更新标记
- 提供APK文件下载

## 系统要求

- Node.js 14.x 或更高版本
- Nginx (用于反向代理和静态文件服务)

## 安装步骤

### 1. 克隆仓库

```bash
git clone <repository-url>
cd apk-version-manager
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

创建 `.env` 文件并设置以下变量：

```
PORT=5000
NODE_ENV=production
```

### 4. 配置Nginx

将提供的 `nginx.conf` 文件复制到Nginx配置目录，或者将其内容添加到现有配置中。

```bash
# 复制配置文件
sudo cp nginx.conf /etc/nginx/conf.d/apk-manager.conf

# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
```

### 5. 启动应用

```bash
# 使用PM2启动应用（推荐用于生产环境）
npm install -g pm2
pm2 start app.js --name "apk-manager"

# 或者直接使用Node启动
npm start
```

## 使用方法

### 访问管理界面

打开浏览器访问 `http://your-server-ip`，你将看到APK版本管理界面。

### 上传新版本

1. 在管理界面中，填写版本信息表单
2. 选择APK文件
3. 填写版本名称、版本号和更新说明
4. 如果需要强制更新，勾选"强制更新"选项
5. 点击"上传"按钮

### API接口

#### 获取最新版本

```
GET /api/update
```

响应示例：

```json
{
  "hasUpdate": true,
  "versionName": "1.0.1",
  "versionCode": 2,
  "updateDescription": "1. 修复已知问题\n2. 优化用户体验\n3. 新增功能",
  "downloadUrl": "http://your-server-ip/uploads/apk/apk-123456789.apk",
  "forceUpdate": false
}
```

#### 检查更新

```
GET /api/update/check?versionCode=1
```

响应示例：

```json
{
  "hasUpdate": true,
  "versionName": "1.0.1",
  "versionCode": 2,
  "updateDescription": "1. 修复已知问题\n2. 优化用户体验\n3. 新增功能",
  "downloadUrl": "http://your-server-ip/uploads/apk/apk-123456789.apk",
  "forceUpdate": false
}
```

#### 获取版本历史

```
GET /api/update/history
```

响应示例：

```json
{
  "latest": {
    "versionName": "1.0.1",
    "versionCode": 2,
    "updateDescription": "1. 修复已知问题\n2. 优化用户体验\n3. 新增功能",
    "downloadUrl": "http://your-server-ip/uploads/apk/apk-123456789.apk",
    "forceUpdate": false
  },
  "history": [
    {
      "versionName": "1.0.0",
      "versionCode": 1,
      "updateDescription": "初始版本",
      "downloadUrl": "http://your-server-ip/uploads/apk/apk-987654321.apk",
      "forceUpdate": false,
      "releaseDate": "2023-01-01"
    }
  ]
}
```

## 数据库版本（可选）

如果你想使用数据库而不是JSON文件存储版本信息，可以按照以下步骤进行配置：

### 1. 安装MongoDB

```bash
# Ubuntu/Debian
sudo apt-get install -y mongodb

# CentOS/RHEL
sudo yum install -y mongodb

# 启动MongoDB服务
sudo systemctl start mongodb
```

### 2. 安装MongoDB驱动

```bash
npm install mongoose
```

### 3. 创建数据库模型

创建 `models/AppVersion.js` 文件：

```javascript
const mongoose = require('mongoose');

const AppVersionSchema = new mongoose.Schema({
    platform: {
        type: String,
        enum: ['android', 'ios'],
        default: 'android'
    },
    versionName: {
        type: String,
        required: true
    },
    versionCode: {
        type: Number,
        required: true
    },
    updateDescription: {
        type: String,
        required: true
    },
    downloadUrl: {
        type: String,
        required: true
    },
    forceUpdate: {
        type: Boolean,
        default: false
    },
    fileSize: {
        type: Number
    },
    isLatest: {
        type: Boolean,
        default: false
    },
    releaseDate: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('AppVersion', AppVersionSchema);
```

### 4. 修改路由以使用数据库

修改 `routes/update.js` 文件，使用MongoDB代替JSON文件。

## 安全建议

- 添加身份验证，确保只有授权用户可以上传和管理APK
- 使用HTTPS保护数据传输
- 定期备份版本数据
- 限制上传文件大小和类型
- 实施速率限制，防止滥用API

## 许可证

MIT