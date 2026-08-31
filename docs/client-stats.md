# 客户端统计上报

服务端仓库（本项目）只提供接口。Android / Windows 等客户端按本文接入或升级。Cursor 在其它工程里改代码时，使用个人 skill `client-stats-report`。

管理页：`/admin/stats`（需登录）。客户端**不要**调用管理查询接口。

## 接口

```
POST {BASE_URL}/api/stats/report
Content-Type: application/json
```

公开，无需 token。成功：`{"success": true}`。

限制：同一 IP 每分钟最多 30 次；请求体不超过 10KB。

`BASE_URL` 走客户端现有环境配置，不要写死域名。

## 故障隔离（硬性）

**上报地址不可用（DNS 失败、连不上、超时、TLS 错误、4xx/5xx、429）时，程序必须照常启动和运行。** 统计是附加能力，不是启动条件。

必须做到：

- 全程异步 / fire-and-forget，禁止在启动路径、登录路径、UI 线程上同步等待上报结束
- 单独设置短超时（建议连接+整请求合计 ≤ 5 秒），不要沿用业务接口的长超时
- 捕获一切异常与非 2xx；不抛到上层、不崩溃、不弹窗、不 Toast、不阻断登录/启动
- 进程内最多延迟重试 1 次，之后放弃；心跳失败不要加密重试或排队打满
- 不要因为上报失败回滚业务状态（登录成功不能因上报失败变成失败）
- 最好用独立 Http 客户端或独立超时配置，避免统计超时拖垮其它接口

验收：把 `BASE_URL` 改成不可达地址后，冷启动、登录、退出、主界面均应正常。

## 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `appId` | 是 | 1–128，`[A-Za-z0-9._-]`。禁止 `products` / `report`。产品间保持稳定 |
| `deviceId` | 是 | 8–128，`[A-Za-z0-9._-]`。首次生成 UUID 并持久化。禁止硬件 ID / 广告 ID / MAC |
| `platform` | 是 | `android` / `ios` / `windows` / `mac` / `linux` |
| `event` | 否 | `launch` 或 `heartbeat`。不传视为 `launch`，**会计打开次数** |
| `appName` | 否 | 显示名，最长 64 |
| `account` | 否 | 登录账号，最长 128。退出必须显式传 `""`，省略不会清空 |
| `versionName` | 否 | 最长 64 |
| `versionCode` | 否 | 整数 |
| `osVersion` | 否 | 最长 64 |
| `deviceModel` | 否 | 最长 64 |
| `arch` | 否 | 最长 32，如 `arm64` / `x64` |
| `locale` | 否 | 最长 32 |
| `channel` | 否 | 最长 32 |

未知字段会被忽略。没出现的选填字段不会覆盖成空。

```json
{
  "appId": "com.example.myapp",
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "platform": "android",
  "event": "launch",
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

心跳：其它字段照旧，只把 `event` 改为 `"heartbeat"`。

## 上报时机

| 时机 | `event` | 说明 |
|---|---|---|
| 冷启动（进程从无到有） | `launch` | 每个进程生命周期默认一次 |
| 登录 / 切换账号 | `launch` | 立刻补报，带新 `account` |
| 退出登录 | `launch` | 必须带 `"account": ""` |
| 桌面长驻 24h 心跳 | `heartbeat` | 只刷新在线。漏标会把心跳算成打开 |
| 热启动、从后台/托盘恢复 | — | **不要**报 `launch` |

## 已接入时怎么改

1. 搜索 `/api/stats/report`、`stats/report`。
2. **保留**已有 `deviceId`，不要重新生成。
3. 冷启动请求加上 `"event": "launch"`（当前若只在冷启动调用，不传也能用，建议显式传）。
4. 已有定时上报必须改成 `"event": "heartbeat"`，间隔 24 小时。这是升级关键。
5. 核对退出登录是否传了 `"account": ""`。
6. 不要并存两套上报。

## 不要做的事

- 不要调用 `/api/stats/products`、`summary`、`devices`、`trend`（需 admin token）
- 不要用硬件标识当 `deviceId`
- 不要在 UI 线程 / 启动关键路径同步请求
- 不要让统计上报的失败或超时影响启动、登录或其它接口
- 不要为这一个接口引入新网络框架；复用项目现有 Http 客户端（须单独短超时）
