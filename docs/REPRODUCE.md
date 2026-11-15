# 复现与操作说明（当前版本）

## 环境与依赖

从解压根目录运行，使用 Windows、PowerShell、Node.js 与 pnpm。产品适配器实际生成 PowerShell 命令，使用 `standard-windows` preset；不声明其他平台兼容。依赖由 `package.json`/`pnpm-lock.yaml` 固定，Node 须支持源码使用的 `import.meta.dirname`、`import.meta.filename`、fetch 和 WebSocket。AGH 服务另按官方固定提交 `a39272bb6bcb3109584e1bd3abac595789ae365d` 的 README 安装配置。宿主使用 profile `local-dev`、route `account-studyspace-astra-api`、`gpt-6-astra`、ToTokens `https://totokens.cc/v1` Responses；密钥只留在宿主安全配置。随包 `vendor/agh/agh-sdk.mjs` 是官方编译后的客户端 SDK（compiled client），不是 AGH 服务，不能代替服务安装。

```powershell
# 最小运行依赖，不下载开发录屏二进制
pnpm install --prod --frozen-lockfile --ignore-scripts
node src/task-api.mjs
```

这些是复现方法，不表示本轮执行，也未声明已在另一台机器验证。当前环境要求项目、缓存及临时文件均在F盘；其他复现者可使用自己的项目位置。安装时可追加 `--store-dir .cache/pnpm-store --cache-dir .cache/pnpm`；PowerShell 可先执行 `New-Item -ItemType Directory -Force .tmp`，再将 `$env:TEMP` 与 `$env:TMP` 手动设为 `(Resolve-Path .tmp).Path`，仅作用于当前进程环境。不要将密钥放入项目。

开发测试安装使用 `pnpm install --frozen-lockfile --ignore-scripts`，包含开发依赖。`ffmpeg-static` 未用于 runtime，忽略安装脚本不会下载其录屏二进制；浏览器测试需 Playwright 可用浏览器，按脚本指定的渠道准备浏览器，不随包分发浏览器程序。

离线代码测试（不调用模型）：

```powershell
node bin/studyspace.mjs run-tests
node tests/phase06-special.mjs
node tests/assets.mjs
```

分别对应已记录的核心19/19、专项24/24和资产21/21；本轮不重跑。运行会产生新时间/UUID结果文件或目录，保留原路径，不将新结果覆盖到旧报告。旧核心17/19、资产15/21、完整E2E4/5及后续定向2/2均按原运行保留，定向通过不等于完整套件重跑通过。

AGH官方安装/运行步骤请参照固定提交 `a39272bb6bcb3109584e1bd3abac595789ae365d` 的官方README；本机原文参考目录为 `F:/AGH/source`。请通过AGH宿主正常安装/启动，不复制AGH源码进业务项目，也不要将本机F盘路径要求施加给其他评委。

## 启动工作台

终端一：

```powershell
node src/task-api.mjs
```

默认只监听回环 `127.0.0.1:4319`，可用 `STUDYSPACE_PORT` 修改；AGH 服务地址支持 `AGH_URL`/`STUDYSPACE_AGH_URL`，前者优先，默认 `http://127.0.0.1:4177`。例如在启动前手动执行 `$env:AGH_URL = 'http://127.0.0.1:4177'` 和 `$env:STUDYSPACE_PORT = '4319'`。`config/runtime.example.json` 仅作配置参考，不由代码自动读取；AGH WebSocket 连接限制为 localhost 或127.0.0.1。浏览器在本机打开 `http://127.0.0.1:4319/`。通过 HTTP 服务加载 three.js 和 `viewer-webgl.mjs`；`file://` 直接打开 `viewer.html` 的早期说明已过时。点“一键设计”会创建真实 AGH 产品任务，不是仅运行本地优化器。repair-test 选项仅用于明确标记的测试故障注入。

## API 与任务资产

端点、字段及错误语义见 [`API.md`](API.md)。API 默认将每个 job 写入 `results/jobs/<32位jobId>/`。任务终态需分别读取业务验收状态与原生 AGH/连接状态；`constraints-not-satisfied` 表示有限搜索预算内未找到，不是无解证明。浏览器下载的 `editable.json`、`scene.glb`、`plan.svg`、`geometry-report.json` 及任务文件为当前 job 证据。

独立离线资产操作：

```powershell
# 将占位路径替换为实际布局文件和未使用的新输出目录
node bin/assets.mjs export tests/sample-6-seat.json results/runs/<新目录>/layout.json results/assets/<新目录>
node bin/assets.mjs verify results/assets/<同一目录>
```

导出目标须为新的未占用目录；不要拿真实 job 资产做破坏性测试。GLB 查看器只声明支持项目报告所列的受限子集。

## 实际执行与历史回放

“一键设计”创建实际 AGH 模型任务，需宿主配置与额度，产生新的 job ID、调用链和用量。正常/修复最新集成记录位于 `results/session-load-verification-2026-10-11T13-31-58.630Z/`；查看既有 job、账本、边界/失败视频片段属于历史回放，不是新执行。故障注入须标注为测试；不得重写原始失败或取消记录。

输入以源码 schema 和 API 为准：矩形房间、一个门、最多3个固定障碍、最多12个工作位、0°/90°两个朝向，尺寸单位为米。所有数据是模拟场景；桌椅及使用空间参与占用检查。通道设置不是消防认证；有限搜索未找到不证明绝对无解，通过不证明全局最优。

## 精简提交包准备

`bin/package-submit.mjs` 使用显式白名单整理源码、必要测试/fixture、复现与验证文档、真实产品任务证据、官方脱敏导出、两条3—5分钟视频和必要截图。它排除PPT、开发控制脚本、聊天记录、node_modules、缓存、密钥、AGH state及其他旧失败调试材料。目标目录固定为 `deliverables/submission-20261015-唯一号/本科生组-U316-智习空间队-陈炳然.zip`，若目标已存在会停止，避免覆盖旧包。本轮仅准备脚本，未执行封包。

公开源码目录 `public-release` 和公开链接须在实际发布后再填写；当前产品接口为本机 `127.0.0.1`，不作为在线体验链接。

## 版本与证据

阶段06机器清单 `results/phase06-final-summary.json` 和 `docs/PHASE06_REPORT.md` 记录当时运行版本与证据。旧39/306项 SHA 清单是历史快照，原报告及原 SHA 保持不变；不表示当前代码等同旧快照，也不声明旧306项文件已全量归档。打包成功后，包内 `results/submission-artifacts-sha256.json` 与 `PACKAGE-MANIFEST.json` 记录本次选取文件的实际字节数和 SHA-256，明确排除各自自身；包外审计记录 ZIP 实际条目核对和 ZIP 哈希。本轮尚未执行打包，不能把预定清单当成已生成的包。

阶段06、session-load集成和两条视频是不同运行记录；本精简提交包不含PPT。模型提供方和快照版本未独立核实，未知字段为 null；estimated费用不是实付账单。据队长转述，赛务已确认允许第三方模型且只要有AGH核心参与即可；项目实际gpt-6-astra+AGH，未调用Agnes模型，不声称已通过赛务审核。