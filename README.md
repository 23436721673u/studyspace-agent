# 一间好自习

**校园自习空间布局设计与自动验收智能体**  
队伍：智习空间队（单人队伍）｜本科生组｜工程设计与数字世界｜3D设计与空间智能  
队长：陈炳然｜无锡学院·电子信息工程学院·通信工程｜大一/本科生｜官方编号：U316

> **数据声明：本仓库的演示输入、布局、截图和输出均为模拟场景，不是实测、真实部署或真实用户试验。**

## 项目简介

将矩形自习空间、单门、固定障碍、座位需求及通行约束转成可追踪的设计任务。工作台“一键设计”会调用本地产品 API 创建真实 AGH 会话，由 AGH 内配置的 `gpt-6-astra` 理解需求并规划步骤；具体布局搜索、独立几何验收、导出和资产复核由明示的确定性代码工具完成。产品记录 job/session ID、模型/渠道、可用 usage、AGH 工具调用与状态。

系统限于矩形房间、一个门、最多3个固定障碍、最多12个桌椅位、0°/90°方向。桌、椅和椅后使用空间参与占用；检查边界、重叠、开门保留区、设定通行宽度和各座位可达性；二维、GLB 和可编辑 JSON 使用共同布局输入。优化器与独立验收器分离，最终 GLB/JSON 会重新读取复核。

## 运行

从解压后的项目根目录运行以下命令，使用本机安装的 Node.js 与 pnpm。当前产品 AGH 适配器使用 Windows preset 与 PowerShell 命令；未验证其他平台。AGH 服务须另按官方固定提交 `a39272bb6bcb3109584e1bd3abac595789ae365d` 的安装及配置说明部署，配置 profile `local-dev`、route `account-studyspace-astra-api`、模型 `gpt-6-astra` 和 ToTokens `https://totokens.cc/v1` Responses。密钥只由宿主安全配置管理。随包的 `vendor/agh/agh-sdk.mjs` 是官方编译后的客户端 SDK（compiled client），不是 AGH 服务；服务仍须独立安装配置。

```powershell
pnpm install --prod --frozen-lockfile --ignore-scripts
node src/task-api.mjs
```

最小安装只安装运行依赖。AGH 地址默认 `http://127.0.0.1:4177`，可手动设置 `AGH_URL` 或 `STUDYSPACE_AGH_URL`（前者优先）；产品端口可设 `STUDYSPACE_PORT`，默认4319。`config/runtime.example.json` 仅为环境变量配置参考，程序不会自动读取该 JSON。缓存及临时目录设置见复现说明。

在同一项目工作区用浏览器打开 `http://127.0.0.1:4319/`。WebGL 查看器依赖 HTTP 服务与锁定的 three 模块，不要用 `file://` 直接打开页面。完整复现、测试及 API 说明见 [`docs/REPRODUCE.md`](docs/REPRODUCE.md)、[`docs/API.md`](docs/API.md)。

## 测试与历史证据

开发测试先执行 `pnpm install --frozen-lockfile --ignore-scripts` 安装含开发依赖的锁定版本；浏览器测试另需 Playwright 可用浏览器。`ffmpeg-static` 属于开发依赖，未用于产品 runtime；忽略安装脚本避免触发其二进制下载。

- 离线代码测试：`node bin/studyspace.mjs run-tests`、`node tests/phase06-special.mjs`、`node tests/assets.mjs`，对应既有19/19、24/24、21/21记录，不调用模型。
- 实际 AGH 任务：工作台“一键设计”会触发配置模型与工具，需运行中的 AGH 服务，会产生新任务及用量。
- 历史回放：查看已有 job、原生账本或视频中的边界/失败记录，不计作新模型执行。

## 已验证结果

阶段06记录：核心夹具19/19、专项24/24、资产21/21、定向 E2E 2/2；原始完整 E2E 4/5、旧资产15/21、旧核心17/19 失败仍保留。实际正常、修复、边界、预算内未找到和非法输入任务 ID、基线比较与限制见 [`docs/VALIDATION.md`](docs/VALIDATION.md) 和 [`docs/PHASE06_REPORT.md`](docs/PHASE06_REPORT.md)。这些是既有阶段06运行，不暗示新测试已重跑。

## 一键入口与精简交付

从项目根目录双击 `一键打开工作台.cmd`，或按 `docs/REPRODUCE.md` 启动本地 HTTP 工作台。点击“一键设计”会创建真实产品 AGH 任务；历史回放可在无模型时查看。接口默认只监听 `127.0.0.1`，不是公开体验地址。

`bin/package-submit.mjs` 仅按显式白名单准备提交阶段目录和 ZIP：保留源码、必要测试与 fixture、运行入口、复现/验证/来源/模型/声明材料、真实任务链、官方脱敏导出、两条实际视频及必要截图；排除 PPT、开发控制脚本、聊天记录、node_modules、缓存、密钥和 AGH state。本轮仅准备脚本，尚未执行封包。

## 关键文件

- `src/`：布局、几何、独立验收、资产、AGH 适配与 API。
- `workbench.html`、`viewer.html`：工作台和 GLB 查看器。
- `results/`：模拟测试、任务及原始证据；不要改写旧结果。
- `docs/`：复现、API、模型、验证、许可与提交审阅材料。
- `media/`：229.6秒旧版完整闭环视频及212.202646秒新版工作台视频；新版视频明确包含历史回放和连接异常，不能冒称录像中完成了新版后续任务。视频19项业务检查及全片解码通过，但旧版原 strict 报告仍为 false，26个 ERR_ABORTED 取消未逐条归因；详见随包媒体报告。

## 限制

有界搜索未找到不证明绝对无解；通过布局不证明全局最优。门扇使用保守矩形近似。通行宽度仅为本项目输入约束，不是消防认证。底层模型提供方及快照版本未独立核实；AGH 宿主不等同 Agnes 模型证据。据队长转述，赛务已确认允许第三方模型且只要有AGH核心参与即可；项目实际gpt-6-astra+AGH，未调用Agnes模型，不声称已通过赛务审核。身份及官方编号已按本人提供填写；署名不等于签名，声明未签，待本人核对签署。视频尚未上传，公开视频URL及公开项目帖链接待本人提供。最终规范ZIP名为 `本科生组-U316-智习空间队-陈炳然.zip`，须以唯一新包完整审计通过为交付前提；本轮不封包、不提交、不发布。