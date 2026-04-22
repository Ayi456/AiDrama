# 单个腾讯云 SCF Web 函数承载前后端设计稿

日期：2026-04-22

## 1. 背景

当前项目已经具备“一个后端进程同时提供 API 和前端静态页面”的基本形态：

- 后端 API 挂载在 `/api/v1`
- 后端末尾通过 `serveStatic` 提供前端静态资源和 `index.html`

当前阻塞点不是“前后端能不能放在同一个 Web 函数”，而是：

1. 后端仍然按 `frontend/dist` 读取前端产物
2. Nuxt 当前实际静态产物目录为 `frontend/.output/public`
3. 项目还没有整理出适合腾讯云 SCF Web 函数的启动入口和部署产物目录

本设计稿只覆盖以下范围：

- 单个腾讯云 SCF Web 函数同时承载前端和后端
- 前端使用静态生成产物
- 后端继续使用 Hono
- 暂不处理数据库、文件存储、FFmpeg、异步任务拆分

## 2. 目标

目标是让项目可以以“单个 SCF Web 函数”的方式部署，并满足：

1. 访问根路径 `/` 可以打开前端页面
2. 访问 `/api/v1/*` 可以命中后端 API
3. 前端使用相对路径请求 `/api/v1`，无需跨域
4. 刷新前端页面子路由时，仍然返回 SPA 的 `index.html`
5. 本地开发模式尽量保持不变

## 3. 非目标

本阶段不处理以下问题：

- SQLite 是否适合云函数
- 本地文件写入是否适合云函数
- FFmpeg、Sharp 等原生依赖的云端运行方案
- 长任务和后台任务的稳定执行
- 多函数拆分、队列化、COS、云数据库迁移

这些问题后续如进入真实生产部署，需要单独设计。

## 4. 约束

本方案遵守以下约束：

1. 前端和后端必须部署在同一个腾讯云 SCF Web 函数中
2. 前端不使用 Nuxt SSR，仅使用静态产物
3. API 与前端页面保持同域同源
4. 路由顺序必须保证 API 优先、静态资源其次、SPA fallback 最后

## 5. 当前状态

当前代码中的关键事实：

- `backend/src/index.ts` 中已经先注册 `/api/v1`，再注册静态资源和 `*` fallback
- `frontend/nuxt.config.ts` 中 `ssr: false`
- `frontend/app/composables/useApi.ts` 中 API 基址固定为 `/api/v1`
- `frontend npm run generate` 后，产物位于 `.output/public`

这意味着从架构上看，项目已经接近目标，只差部署形态整理和少量适配。

## 6. 目标架构

部署后保持单个 Web 函数：

```text
Browser
  └─ HTTPS
      └─ Tencent Cloud SCF Web Function
           ├─ Hono API: /api/v1/*
           ├─ Hono Webhooks: /webhooks/*
           ├─ Static assets: /_nuxt/*, /favicon.png, ...
           └─ SPA fallback: / -> index.html, /settings -> index.html
```

运行模型：

1. 腾讯云 SCF 启动一个 Node Web Server
2. Web Server 监听 SCF 要求的端口
3. Hono 同时处理 API 和静态文件
4. 非 API 请求优先尝试命中静态文件
5. 未命中静态文件时返回前端 `index.html`

## 7. 路由设计

路由优先级必须固定为：

1. `/api/v1/*`
2. `/webhooks/*`
3. `/static/*` 或其他后端暴露的资源路由
4. 前端静态资源文件
5. `*` fallback 到 `index.html`

推荐保持如下思路：

```text
app.route('/api/v1', api)
app.route('/webhooks', webhooks)
app.use('/static/*', ...)
app.use('*', serveStatic({ root: frontendPublicPath }))
app.get('*', serveStatic({ root: frontendPublicPath, path: 'index.html' }))
```

这样可以保证：

- API 不会被 SPA fallback 吃掉
- 静态资源优先返回真实文件
- Vue Router 的前端页面刷新仍然正常

## 8. 构建与产物目录设计

### 8.1 前端产物

前端使用 `npm run generate` 生成静态文件，真实产物目录为：

```text
frontend/.output/public
```

因此后端不应再依赖 `frontend/dist`。

### 8.2 部署产物

推荐在仓库中统一整理出一个部署目录，例如：

```text
deploy/
  server/
  public/
  scf_bootstrap
```

其中：

- `server/` 放后端可运行代码
- `public/` 放前端静态产物
- `scf_bootstrap` 负责启动 Web Server

也可以不引入 `deploy/`，直接在现有目录结构上运行，但后续打包和发布会更乱。为了后续部署稳定，建议引入统一部署目录。

## 9. 启动方式设计

腾讯云 SCF Web 函数要求通过启动脚本拉起一个 Web Server，并监听指定端口。根据官方文档，启动文件通常为 `scf_bootstrap`，Web 服务监听 `9000` 端口。

因此推荐把后端入口拆分为两层：

### 9.1 `app.ts`

只负责：

- 创建 Hono 实例
- 注册中间件
- 注册 API 路由
- 注册静态文件和 fallback

不直接调用 `serve(...)`

### 9.2 `server.ts`

只负责：

- 从 `app.ts` 导入 Hono app
- 读取端口
- 调用 `serve({ fetch: app.fetch, port })`

这样本地开发和 SCF 启动都能复用同一个 app 定义，后续切换部署模式也更容易。

## 10. 前端访问策略

前端当前 API 基址为相对路径 `/api/v1`，这是单个 Web 函数方案中的优点，应当保留。

结论：

- 当前阶段不必把前端 API 地址改成完整域名
- 当前阶段不必增加跨域配置复杂度
- 当前阶段可以继续让前端通过相对路径访问同域 API

开发环境中保留 Nuxt proxy 不影响生产；生产环境下代理不会生效，但因为仍然是同源部署，所以没有问题。

## 11. 推荐修改范围

本设计稿对应的后续修改范围如下。

### 11.1 后端

- 修改前端静态资源根目录，不再使用 `frontend/dist`
- 抽出 `app.ts` 与 `server.ts`
- 为部署路径预留统一的 `FRONTEND_PUBLIC_PATH` 或等价配置

### 11.2 前端

- 保持 `ssr: false`
- 保持 `/api/v1` 相对路径请求
- 明确后续部署流程使用 `npm run generate`

### 11.3 部署

- 新增 `scf_bootstrap`
- 新增一套构建脚本，将前端产物和后端运行文件整理到部署目录
- 后续 README 增加“单个腾讯云 SCF Web 函数部署”章节

## 12. 实施顺序

后续按以下顺序推进最稳：

1. 修正后端静态目录读取逻辑
2. 拆分 `app.ts` 和 `server.ts`
3. 增加统一部署目录
4. 增加 `scf_bootstrap`
5. 增加打包脚本
6. 本地按“接近云函数产物”的方式做一次启动验证
7. 最后补 README 部署说明

## 13. 风险与注意事项

虽然本设计稿暂时不处理数据库、文件、FFmpeg，但仍需明确这些风险：

1. 当前项目后续如果真的跑到云函数生产环境，本地 SQLite 和本地文件写入会成为新阻塞点
2. 当前有部分“请求返回后继续在进程内执行”的异步任务，这种方式在云函数环境中并不稳
3. 如果后续引入原生依赖或大体积二进制，可能需要镜像部署而不是简单代码包部署

这些问题本阶段不改，但文档和实现时要避免把当前方案误写成“完整生产方案”。

## 14. 结论

在“数据库、文件、FFmpeg 暂不考虑”的前提下，前后端完全可以部署到同一个腾讯云 SCF Web 函数中，而且这是当前阶段最简单、改动最少的方案。

后续实现的核心不是拆函数，而是：

1. 让后端读取正确的前端静态产物目录
2. 整理出适合 SCF Web 函数的启动入口
3. 把部署产物打包成清晰、稳定的一套目录结构

## 15. 参考资料

- 腾讯云 SCF Web 函数启动文件：<https://cloud.tencent.com/document/product/583/56126>
- 腾讯云 SCF 工作原理：<https://cloud.tencent.com/document/product/583/9694>
