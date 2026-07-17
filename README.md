# Web Message Backend

使用 Go 编译为 WASM、运行于 Cloudflare Workers 的临时聊天室后端。

## 架构

- `main.go`：Go WASM Worker，使用 `github.com/syumai/workers` 提供 HTTP 服务。
- `build/worker.mjs`：由 `workers-assets-gen` 自动生成的 Go WASM 入口。
- `worker.mjs`：参照官方 `_examples/durable-object-counter` 的组合方式，导入 Go Worker，并提供 Cloudflare 专有 API 的薄桥接层。
- `ChatRoom` Durable Object：按房间维护 WebSocket 连接，只转发实时消息和 WebRTC SDP/ICE 信令，不写入 Storage。
- 文件内容始终通过浏览器 WebRTC DataChannel 点对点传输，不经过后端。

`syumai/workers` 当前只把标准 `net/http` 响应导出为普通 JavaScript `Response`，未提供 Go 版 `WebSocketPair`、101 响应的 `webSocket` 属性或 Go Durable Object 类。因此 Cloudflare WebSocket 生命周期必须保留在最小的 JavaScript 平台桥接层中；普通 HTTP 服务仍由 Go WASM 实现。

## 本地开发

要求 Node.js、Go 1.23 或更高版本。

```text
npm install
npm run dev
```

默认地址为 `http://localhost:8787`，Go 健康检查为 `/health`。

## 构建与部署

```text
npm run build
npm run deploy
```

构建脚本使用 `cross-env`，可在 Windows、Linux 和 macOS 上设置 `GOOS=js GOARCH=wasm`。
