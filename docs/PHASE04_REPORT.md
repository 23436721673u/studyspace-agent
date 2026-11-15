# 阶段04：AGH 核心工作流与恢复验证

## 范围与实现

产品任务由 `src/agh-runner.mjs` 通过官方 AGH Node SDK 编译依赖建立独立会话，不将开发时 CLI 执行冒充模型执行。每个 job 使用 32 位 UUID 对应的 `agnes:local:local-dev:cli:workspace:<uuid>` sessionKey。运行设置 primary、escalation、fast、compaction、verifier 五个 slot 为 route `account-studyspace-astra-api` / model `gpt-6-astra` / thinking `medium`。连接读取本地网页 `agnes-config` meta 的 `data-ws`，用 `agnes-v1`、local auth、SDK `memoryJournal` 及 Origin `http://127.0.0.1:4177`。

模型可调用范围限于绑定该 job 的精确 `bin/job.mjs` 步骤命令和项目 cwd；权限回调在恢复 `session.load` 重放前注册。job 独立保存输入哈希、状态、提示哈希、审批、SDK 事件、UI 投影、步骤输出及依赖/输出收据。已完成步骤只有在输入、代码版本、先决步骤和输出哈希一致时复用；过期或无收据记录不会覆盖。原生 AGH turn status/reason 与独立业务验收状态分字段保留。失败案例仍为失败；测试注入只用于验证修复。

## 真实产品执行（数据均为模拟场景）

| 案例 | Job / session | 实际结果 |
|---|---|---|
| 正常六座 | `2e857ec6b7014278b0061c802f40dfac` | inspect→search→check-search→export→verify，业务 verify=pass；6 次 GPT-6 Astra inference。connection.json 记录总 input 32001、output 5960、cacheRead 43511、reasoning 4826；费用为 AGH ledger estimated，不代表结算账单。 |
| 干净反馈修复 | `a6c68fb6fe3b426b90458091c76d1dcb` | test-injection 越界 draft 经独立检查反馈（24 issues）后 bounded search 修复；原输入哈希及六座/通道要求未改；search、check-search、export、verify 通过，原生 turn completed。 |
| 门宽边界 | `3b0410823dec41d48c0e43a6a5386878` | 门宽恰为通道要求 0.8 m；真实 AGH 工作流及资产复核通过。 |
| 非法尺寸 | `d9e7849a73b443e8b708afcaa86bac8f` | 输入 room.width=-1；schema-fail，原生 turn completed 并停止，没有导出或放宽需求。 |
| 断线测试 | `b4cda4ef82004c3b9caa053cf4b92a2a` | 测试只终止本测试创建的 adapter 子进程，不取消宿主 turn；已保存 sessionId 和 inspect 后恢复同一 session，最终缺失步骤与 verify 通过。原 `connection-fault-test.json` 中旧的一条不合适断言 `oneUserMessage=false` 原样保留。新版对该原生历史的分析另存 v3。 |

历史 repair job `732577562bd34acc9c97bdc7765e85b7` 原生 turn=`blocked`、verifier=`schema_invalid`，业务资产 verify 通过；因此它不是干净成功，原记录未改写。新 job `a6c68...` 是独立干净修复运行。断线恢复过程中允许原生回合终止后提交**只含缺失步骤**的续跑指令；若原回合仍运行，则先观察，不重新提交 prompt。

### 恢复判据 v3

`tests/recovery-criteria.mjs` 过滤分析 `b4c...` 已保存的实际 UI 与原生事件：业务用户消息 seq10 与 seq72；系统 runtime context seq17 不计入业务消息。seq68 `turn/end completed` 时间早于 seq72 续跑；首轮只完成并验收 inspect。seq10 包含五步骤全计划，seq72 的实际命令为 search、check-search、export、verify。最终各步骤一次、sessionId 与稳定 sessionKey 一致、输入哈希未变、资产复核通过、最终 native turn completed。判据通过；旧 `oneUserMessage=false` 不被改成 true，输出为新建且独占写入的带时间戳 `results/jobs/b4c.../recovery-criteria-review-v3-*.json`。

## API / 产品分工

`src/task-api.mjs` 提供 POST `/api/jobs`（持久化输入并启动真实 `bin/agh-job.mjs` 产品适配器）、GET `/api/jobs/:id`（读取 job 与连接快照）、POST `/api/jobs/recover?id=<jobId>`。恢复接口先严格校验 32 位十六进制 job ID，再读取项目内 job 文件；非法/null JSON 和 null input 返回结构化 400/422，不进行任意路径读取。它不是 UI；前端工作台及浏览器验证留在阶段05。`bin/job.mjs` 的确定性计算是明确代码工具，AGH 模型规划/步骤编排由 SDK 产品会话执行。

本轮 HTTP 端到端证据：`results/task-api-smoke-2026-10-10T23-00-52.591Z.json`，固定回环端口 4397 的测试服务自行启动并关闭。真实 job `eb20b62a0d73465f8426268db6c785b5` / sessionId `agnes:local:local-dev:cli:workspace:eb20b62a0d73465f8426268db6c785b5` 为模拟输入，HTTP 202，connection=`turn-ended`，business=`pass`，native=`completed/end_turn`；模型 alias 为 `gpt-6-astra`，ToTokens Responses，usage 原样保留并标 estimated，snapshotVersion 为 null。测试同时实际验证 malformed JSON、null body、null input、缺失/路径型/非十六进制恢复 ID。此前 `results/task-api-smoke-2026-10-10T15-20-17.872Z.json` 因缺失 `createHash` import 的真实 adapter-error 仍保留，修复后新报告独立生成，未覆盖旧失败。

代码协助分工如实说明：需求由学生提供；Codex 控制端转交、审阅并审批；AGH + 当前 GPT-6 Astra 完成已记录的产品规划与工具执行，Agent 也在 AGH 内编写/验证本项目代码。没有声称纯手写或隐藏辅助。

## 模型与证据字段

模型名称 `gpt-6-astra`；路由由公开 `client.config.get()` 的 `provider.route` 读取（当前为 `account-studyspace-astra-api`）；使用渠道由 `provider.baseUrl` 核对为 ToTokens Responses 接入 `https://totokens.cc/v1`；`credentialConfigured` 必须为 true；thinking `medium`；AGH 驱动 ID单独记录为 `driverProviderId`，底层实际模型提供方与不可变版本未独立核实，故 `provider`/snapshotVersion 不作推断。usage/credit 数据保留 AGH 原生 ledger 的 estimated 标记，不冒充供应商结算数据。session、slot 设定、工具事件、许可决策及资产检查位于各 job `results/jobs/<id>/`。不得将 AGH 等同 Agnes 专属模型证据；赛事专属条款依项目说明待赛事核对。

## 本阶段边界

所有样例为模拟输入。搜索是有界确定性搜索与固定行列基线，不证明全局最优或绝对无解。通道是设计约束而非消防认证。未含实测或真实用户部署/试验。阶段05的正式 UI 尚未完成；录制视频、PPT、提交清单和最终预览包仍待后续阶段。
