# 阶段05：交互应用收尾报告

日期：2026-10-11。全部场景均为明确标注的模拟场景，不代表实测、真实部署或真实用户试验。

## 本轮完成

- `src/agh-runner.mjs` 使用 `process.execPath` 与项目根 `resolve()` 生成 PowerShell 命令，并转义单引号；权限校验与命令仍严格绑定当前 job、步骤和项目 cwd。
- AGH 地址支持 `AGH_URL` / `STUDYSPACE_AGH_URL`，默认 `http://127.0.0.1:4177`。连接后调用公开 `client.config.get()`，读取并核对 `configured`、profile、revision、provider.baseUrl/model/route/credentialConfigured；五个 slot 均使用实际返回的 route/model。没有读取密钥。
- 模型记录区分 `driverProviderId` 与底层模型提供方：`driverProviderId=openai` 仅表示 AGH 驱动 ID；`provider=not-independently-verified`，不可变版本为 `null`，不作未经证实的提供方或版本声明。当前 endpoint 为 `https://totokens.cc/v1`，渠道记录为 ToTokens，接口记录为 Responses。
- 原始 `userRequest` 保存在 job/input，并原样进入 AGH prompt；CLI 创建任务时从原始 `input.json` 回填 manifest 的 `userRequest`。
- UI 任务 ID增加可换行布局，终态完成时清除“等待任务结果”残留；采光/窗户等未支持条目据实展示，不声称已满足。
- 补充 Windows/PowerShell、Node、pnpm、端口和 AGH 地址环境变量运行说明，以及配置字段语义和依赖来源说明。

## 新的真实 AGH 浏览器 E2E

执行命令：

```powershell
& 'F:/AGH/tools/node/node.exe' tests/workbench-browser.mjs
```

测试由控制端托管的 `http://127.0.0.1:4319` 提供 HTTP 基础设施，测试自身未启动或停止服务；浏览器使用独立 Edge headless context。新报告：

`results/browser-runs/2026-10-11T00-56-28.411Z/report.json`

新 job：`dfbe5ab0e9394bd68a4c2c43e51d0ac6`

- 15/15 checks pass，0 errors。
- 原生 AGH：`native.status=completed`，`stopReason=end_turn`；业务状态：`business.status=pass`。
- sessionKey/sessionId：`agnes:local:local-dev:cli:workspace:dfbe5ab0e9394bd68a4c2c43e51d0ac6`。
- 模型别名：`gpt-6-astra`；实际 route：`account-studyspace-astra-api`；endpoint：`https://totokens.cc/v1`；usage 保留为 AGH 原生 estimated 字段。
- 原始自然语言需求在输入、job 和实际 prompt 文件中一致，测试已读取并核对 prompt 文件。
- 六个下载资产均 HTTP 200：`scene.glb`、`plan.svg`、`editable.json`、`geometry-report.json`、`verify.json`、`search.json`。
- GLB WebGL 实际加载：74 个部件、888 个三角形，状态包含“WebGL深度测试”。
- 独立结果显示开门区域、通行和可达性均通过，6/6 座通过；刷新后仍恢复同一 job；编辑完成任务后会使旧验收失效。

## 证据与边界

本轮保留旧的正常、边界、失败和历史 `schema_invalid` 结果，没有将旧失败改写为成功，也没有用历史回放替代本轮新 job。确定性布局计算、独立验收和资产复核仍与 AGH 模型编排分开。通行宽度是设计约束，不是消防认证；搜索结果不证明全局最优或绝对无解。AGH 证据不等同 Agnes 专属模型证据，赛事冲突条款待赛事核对。Codex 控制端负责学生需求转交、审阅和批准；AGH + GPT-6 Astra 完成已记录的产品任务编排和工具执行；项目未声明纯手写或隐藏辅助。
