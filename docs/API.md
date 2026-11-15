# Studyspace API（当前实现）

本地 Node ESM HTTP 服务：`& 'F:/AGH/tools/node/node.exe' src/task-api.mjs`，默认仅监听 `127.0.0.1:4319`。浏览器工作台由同一服务提供，GLB WebGL查看需要 HTTP 与已安装的 three 模块；不支持 `file://` 直接打开查看器。结果保存于 `results/jobs/<32位十六进制jobId>/`。

## 创建真实产品任务

`POST /api/jobs`，Content-Type `application/json`：

```json
{"input":{"scenarioLabel":"模拟场景","simulatedScenario":true,"room":{"width":10,"depth":7},"door":{"wall":"south","offset":4,"width":1,"swing":"inward","hinge":"low"},"obstacles":[],"seatTemplate":{"tableWidth":1,"tableDepth":0.6,"tableHeight":0.75,"chairWidth":0.5,"chairDepth":0.5,"chairClearance":0.6,"approachWidth":0.5},"targetSeats":6,"requiredSeats":6,"passageWidth":0.8,"gridSize":0.2,"orientations":[0,90],"searchBudget":{"maxAttempts":12000},"seed":"demo","userRequest":"请遵守约束设计。"},"mode":"normal"}
```

合法请求返回202及 `jobId`、`sessionKey`、`statusUrl`。工作台 repair-test 会传 `mode:"repair-test"`，仅作显式测试故障注入。非法 JSON返回400；null/数组/非对象或schema问题返回422及结构化错误。创建任务后适配器连接真实AGH产品会话；本地确定性程序不会冒充模型。

## 查询、恢复与资产

- `GET /api/jobs/:id`：32位十六进制 job ID 查询持久化 job/connection 状态。
- `POST /api/jobs/recover?id=<jobId>`：恢复同一产品会话/任务，只续跑允许的未完成步骤；非法ID 422、合法但不存在404。
- `GET /api/jobs/:id/files/<job证据文件>` 及 `/api/jobs/:id/assets/<资产文件>`：读取该任务目录中的文件，例如 `events.jsonl`、`agh-events.jsonl`、`search.json`、`verify.json`、`editable.json`、`scene.glb`、`geometry-report.json`、`gltf-validator-report.json`、`plan.svg`。

必须区分 `job.business.status`、`job.native.status` 与 `connection.status`。有限搜索未找到可能为 `constraints-not-satisfied`，不是绝对无解。`job.model` 区分模型别名、route、`driverProviderId`、未独立核实的provider、channel、endpoint、Responses、usage和 `snapshotVersion:null`。`driverProviderId=openai`不证明模型由该厂商提供。estimated usage/cost不等于结算费用。

原阶段03“直接打开viewer.html”的说明已过时；使用本地HTTP根地址浏览工作台及查看器。