# 91bot

`91bot` 是一个完整的订阅演示项目，包含：

- `frontend/`: 面向普通用户的站点，`React + Vite`
- `admin/`: 管理后台，`React + Vite`
- `backend/`: API、X 登录、微信订阅与消息管理，`TypeScript + Express + MongoDB`
- `video/`: 本地抓取的视频缓存目录

当前版本已改为 **文本演示模式**：

- 新用户完成微信订阅后，会自动收到固定欢迎语
- 用户向微信会话发送任意消息时，也会收到同一段固定欢迎语
- 不再主动发送图片或视频
- 后台会落盘保存与每个用户的收发消息，供管理员查看和回复

默认欢迎语为：

```text
欢迎订阅 wikig's channel，本频道当前演示微信订阅、消息收发与管理后台能力。【反诈中心测试】
```

## 功能

### 用户前台 `frontend/`

- X 登录
- 生成 5 分钟有效的微信订阅二维码
- 查看订阅绑定状态
- 查看最近抓取的视频列表

### 管理后台 `admin/`

- 使用后端 `.env` 中写死的管理员用户名和密码登录
- 查看已绑定用户列表
- 查看与单个用户的完整对话记录
- 对单个用户发送文本消息
- 对所有已绑定用户群发文本消息
- 3 秒轮询刷新对话窗口

### 后端 `backend/`

- `twitter-api-sdk` 驱动的 X OAuth 登录
- MongoDB 持久化用户、订阅关系、视频、消息记录
- 每 15 分钟抓取一条随机视频到 `video/`
- 提供管理员接口和普通用户接口
- 使用 `weixin-claw-bot-sdk` 处理微信订阅、长轮询与文本回复

## 目录结构

```text
91bot/
  admin/
  backend/
  frontend/
  video/
  README.md
  package.json
```

## 环境要求

- Node.js 22+
- MongoDB 6+
- 一个可用的 X Developer App
- 一个可用的微信 bot 运行环境

## 配置

### 1. 后端环境变量

复制：

```bash
cp backend/.env.example backend/.env
```

示例：

```env
PORT=4010
MONGODB_URI=mongodb://127.0.0.1:27017/91bot
FRONTEND_URL=http://localhost:5173
ADMIN_FRONTEND_URL=http://localhost:5174
JWT_SECRET=replace-this-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-this-password
X_CLIENT_ID=your-x-client-id
X_CLIENT_SECRET=your-x-client-secret
X_CALLBACK_URL=http://localhost:4010/api/auth/x/callback
CRAWLER_SOURCE_URL=https://samplelib.com/sample-mp4.html
CRAWLER_INTERVAL_MS=900000
QR_TIMEOUT_MS=300000
```

### 2. 用户前台环境变量

复制：

```bash
cp frontend/.env.example frontend/.env
```

默认值：

```env
VITE_API_BASE_URL=http://localhost:4010
```

### 3. 管理后台环境变量

复制：

```bash
cp admin/.env.example admin/.env
```

默认值：

```env
VITE_API_BASE_URL=http://localhost:4010
```

## 安装

在 `91bot/` 根目录执行：

```bash
npm install
```

## 开发启动

同时启动用户前台、后台 API 和管理后台：

```bash
npm run dev
```

单独启动：

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:admin
```

默认地址：

- 用户前台: `http://localhost:5173`
- 管理后台: `http://localhost:5174`
- 后端: `http://localhost:4010`

## 构建

```bash
npm run build
```

后端生产启动：

```bash
npm run start -w backend
```

## 手动测试随机视频下载

```bash
npm run test:download -w backend
```

这会：

- 连接 MongoDB
- 从当前配置的视频源随机挑选一条视频
- 下载到 `video/`
- 用时间戳命名文件
- 写入 MongoDB

## 主要接口

### 普通用户接口

- `GET /api/auth/x/login`
- `GET /api/auth/x/callback`
- `GET /api/me`
- `POST /api/subscriptions/qrcode`
- `GET /api/subscriptions/qrcode/:id`
- `GET /api/videos/recent`

### 管理后台接口

- `POST /api/admin/auth/login`
- `GET /api/admin/me`
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/admin/users/:subscriptionId/messages`
- `POST /api/admin/users/:subscriptionId/messages`
- `POST /api/admin/broadcast`

## 数据模型

### `User`

- X 用户信息
- X token 信息

### `Subscription`

- 用户与微信订阅的绑定关系
- 微信账号、微信用户 ID、bot session

### `Video`

- 抓取来源、下载地址、本地文件路径、媒体类型

### `Message`

- 所属订阅
- 所属用户
- 入站/出站方向
- 消息来源：`user` / `bot` / `admin` / `broadcast`
- 文本内容
- 消息时间

## 当前行为说明

- 微信端只做文本欢迎语回复
- 不再发送图片或视频
- 抓取器仍会抓取并保存视频，但不再自动把媒体发到微信
- 管理后台单发和群发也都只发送文本

## 部署建议

- 前台和管理后台都可部署到任意静态托管
- 后端建议使用 `pm2`、`systemd` 或 Docker 常驻运行
- `video/` 目录建议单独持久化
- MongoDB 建议使用独立实例

## 注意

- `twitter-api-sdk` 仍然是外部依赖，生产前应自行评估稳定性
- 微信发送仍受 `context_token` 会话模型影响
- 管理后台使用固定管理员账号密码，正式环境至少应配合 HTTPS、强密码与独立网关访问控制
