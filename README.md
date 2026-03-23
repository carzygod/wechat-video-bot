# 91bot

`91bot` 是一个完整的全栈订阅项目：

- 前端：`React + Vite`
- 后端：`TypeScript + Express`
- 数据库：`MongoDB`
- 登录：`twitter-api-sdk` 驱动的 X OAuth
- 微信订阅：基于 npm 包 `weixin-claw-bot-sdk`
- 内容源：抓取一个合法公开视频站点中的随机视频

默认的随机视频源配置为：

- `https://samplelib.com/sample-mp4.html`

后端每 15 分钟会从该页面中提取一个随机视频链接并尝试下载到本地 `./video/` 目录。
若视频是首次入库，则记录到 MongoDB，并触发“对已绑定微信订阅用户的自动推送”流程。

## 功能概览

### 前端

- 暗色调黑金视觉
- 新拟物 + 毛玻璃混合风格
- X 登录入口
- 登录后可生成 5 分钟有效的微信订阅二维码
- 轮询显示二维码绑定状态
- 展示最近抓取到的视频列表

### 后端

- `twitter-api-sdk` 驱动 X 登录
- MongoDB 持久化用户、微信订阅关系、视频元数据
- 15 分钟随机视频抓取任务
- `npm run test:download -w backend` 手动强制下载一条随机视频
- 本地视频落盘到 `./video/`
- 微信 Bot 订阅流程
- 新视频入库时自动尝试推送
- 用户在微信对话框发送任何消息时，自动回复一个随机视频

## 目录结构

```text
91bot/
  frontend/
  backend/
  video/
  README.md
  package.json
```

## 环境要求

- Node.js 22+
- MongoDB 6+
- 一个已配置 OAuth 2.0 的 X Developer App
- 一个可用的 Weixin bot 运行环境

## 1. 配置 X Developer App

在 X 开发者后台配置 OAuth 2.0：

- App type: `Confidential client`
- Callback URL:
  - `http://localhost:4010/api/auth/x/callback`
- Scopes:
  - `tweet.read`
  - `users.read`
  - `offline.access`

把 `client_id` 与 `client_secret` 配到后端环境变量里。

## 2. 配置后端环境变量

复制：

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```env
PORT=4010
MONGODB_URI=mongodb://127.0.0.1:27017/91bot
FRONTEND_URL=http://localhost:5173
JWT_SECRET=replace-this-secret
X_CLIENT_ID=your-x-client-id
X_CLIENT_SECRET=your-x-client-secret
X_CALLBACK_URL=http://localhost:4010/api/auth/x/callback
CRAWLER_SOURCE_URL=https://samplelib.com/sample-mp4.html
CRAWLER_INTERVAL_MS=900000
QR_TIMEOUT_MS=300000
```

## 3. 可选配置前端 API 地址

复制：

```bash
cp frontend/.env.example frontend/.env
```

默认即可：

```env
VITE_API_BASE_URL=http://localhost:4010
```

## 4. 安装依赖

在 `91bot/` 根目录执行：

```bash
npm install
```

这会同时安装：

- 根工作区依赖
- `frontend/` 依赖
- `backend/` 依赖

说明：

- `backend/` 现在直接依赖 npm registry 上的 `weixin-claw-bot-sdk`
- 部署时执行 `npm install` 会自动安装该 SDK
- 确保服务器能访问 npm registry，或配置好你自己的镜像源

## 5. 开发启动

在 `91bot/` 根目录执行：

```bash
npm run dev
```

默认端口：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:4010`

## 6. 生产构建

```bash
npm run build
```

然后分别启动：

```bash
npm run start -w backend
```

前端构建产物在：

- `frontend/dist/`

可使用任意静态文件服务器部署。

## 7. 手动测试下载一条随机视频

如果你只想验证爬虫下载链路，不启动完整服务，可以单独执行：

```bash
npm run test:download -w backend
```

这会：

- 连接 MongoDB
- 从当前配置的视频源页面里随机挑选一条视频
- 强制下载一份到 `video/`
- 使用时间戳作为文件名
- 把该视频记录写入 MongoDB

## 数据模型

### User

保存：

- X 用户 ID
- X 用户名
- 昵称
- 头像
- access/refresh token

### Subscription

保存：

- 归属用户
- 订阅二维码状态
- 二维码 URL 与过期时间
- 微信 bot 账号信息
- 微信 user 信息
- bot session
- 待发送视频队列

### Video

保存：

- 来源页面 URL
- 视频下载 URL
- 本地落盘路径
- 文件大小
- 来源站点

## 微信订阅流程

1. 用户通过 X 登录站点
2. 点击生成订阅二维码
3. 后端创建一个待绑定的 Weixin bot login job
4. 返回二维码图片链接给前端
5. 用户使用微信扫描
6. 后端等待 5 分钟内的扫码绑定结果
7. 绑定成功后，把 bot session 落到 MongoDB
8. 启动该 bot 的长轮询监听

## 推送逻辑

### 新用户绑定后

后端会尝试先给该用户发一个随机视频。

### 新视频入库后

后端会遍历所有已绑定订阅，尝试推送该视频。

### 用户在微信对话框发消息后

后端会立即回复一个随机视频。

## 关于微信主动推送限制

当前项目依赖的 `weixin-claw-bot-sdk` 仍然遵循 Weixin `context_token` 会话模型。
这意味着：

- 用户发送过消息之后，后端更容易继续在该对话上下文中回复
- 如果目标用户还没有建立有效上下文，某些视频推送可能会先进入待发送队列
- 待发送视频会在用户下一次向 Bot 发送消息时优先补发

这不是业务 bug，而是当前微信侧会话模型带来的现实限制。

## 默认随机视频抓取策略

后端默认从 `samplelib.com` 的公开视频样例页中提取 `.mp4` 链接：

- 页面抓取
- 提取所有可下载 mp4
- 随机挑选一条
- 去重
- 下载到本地 `video/`

所有实际下载到本地的文件都使用时间戳命名，例如：

```text
1711261234567.mp4
1711261234567-1.mp4
```

如果你要替换内容源，只需要修改：

- `CRAWLER_SOURCE_URL`
- `backend/src/services/videoCrawler.ts` 中的提取规则

## 主要接口

### 登录相关

- `GET /api/auth/x/login`
- `GET /api/auth/x/callback`
- `GET /api/me`

### 订阅相关

- `POST /api/subscriptions/qrcode`
- `GET /api/subscriptions/qrcode/:id`

### 内容相关

- `GET /api/videos/recent`
- `GET /api/health`

## 部署建议

### 前端

- 可部署到任意静态托管
- 生产时把 `VITE_API_BASE_URL` 指向你的后端域名

### 后端

- 建议使用 `pm2`、`systemd` 或 Docker 常驻运行
- 确保 `video/` 有持久化卷
- MongoDB 使用独立持久化实例

### HTTPS / Cookie

如果部署到公网：

- 后端建议放在 HTTPS 后
- Cookie 建议改为 `secure: true`
- X Callback URL 必须与实际域名一致

## 注意事项

- `twitter-api-sdk` 官方仓库明确标注为 beta，生产使用前应自行评估
- 随机视频源抓取逻辑仅适用于可合法获取和下载的公开站点
- 当前项目重点是“完整工程骨架 + 可运行业务链路”，不包含集群、高可用、任务幂等、对象存储分片等生产增强项

## 后续可扩展方向

- 给视频增加缩略图和封面
- 把本地 `video/` 换成对象存储
- 增加任务队列与失败重试
- 增加管理员后台
- 增加订阅统计与用户活跃分析
