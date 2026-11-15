# 第三方来源与许可清单

| 组件/来源 | 用途及版本 | 来源/许可证及交付要求 |
|---|---|---|
| AGH 官方 Node SDK 随附编译模块 | AGH 产品 adapter/会话连接，随项目放于 `vendor/agh/agh-sdk.mjs` | 源模块与 `vendor/agh/LICENSE` 随项目保留。许可文件为 Apache License 2.0；编译文件内包含多项组件，分发时同时检查/附带上游许可及通知，不从编译包中推断不存在其他依赖。上游原始文本不得为去除品牌而修改。 |
| three | `0.180.0`，浏览器 WebGL 查看器及几何显示 | npm 包 `three`；上游 `https://github.com/mrdoob/three.js`。按本地包许可证为 MIT；保留 `node_modules/three/LICENSE`（若将依赖源码纳入归档）。无CDN。 |
| gltf-validator | `2.0.0-dev.3.10`，GLB格式检查 | Khronos Group，Apache-2.0；`https://github.com/KhronosGroup/glTF-Validator`。原始 `LICENSE` 和 `NOTICES` 含Dart SDK及随附组件通知；如分发依赖代码应原样保留。检查报告不替代布局验收。 |
| Playwright | `1.56.1` 测试/浏览器自动化及本地演示捕获工具 | Microsoft，Apache-2.0；`https://github.com/microsoft/playwright`；本地 npm 包含 `LICENSE`、`NOTICE`、`ThirdPartyNotices.txt`，归档前检查并按需保留。Edge使用系统渠道；本项目不要求下载另一套浏览器。 |
| Khronos glTF 2.0 Specification | GLB v2结构参考 | `https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html`；标准规范引用，不复制其素材。 |
| 原创参数化几何和模拟数据 | 桌椅、房间、障碍、平面图与演示场景 | 项目代码生成的简单几何；无第三方模型/纹理素材。数据不是实测。 |
| PowerPoint / Office组件 | 如由本机PowerPoint COM生成和导出演示 | 本地软件执行工具，未将Office二进制复制进项目；只纳入本项目生成的PPT/PNG。 |
| Windows Edge | 如用于隔离浏览器录制/演示 | 本机系统浏览器渠道；不打包浏览器程序或用户profile。 |

## 最终包内许可位置

原始文本均归档至 `vendor/licenses/`：AGH SDK为 `agh-sdk-Apache-2.0.txt`；官方commit对应源码编译模块的捆绑组件为 `ws-8.21.3-LICENSE.txt`、`typebox-0.34.33-license.txt`；three为 `three-MIT-LICENSE.txt`；gltf-validator为 `gltf-validator-Apache-2.0.txt` 与 `gltf-validator-NOTICES.txt`；Playwright/core为各自 `*-Apache-2.0.txt`、`*-NOTICE.txt` 和 `*-ThirdPartyNotices.txt`。上述位置是最终提交包的许可索引；表中node_modules位置仅说明原包来源。

`ffmpeg-static`仅为开发依赖，未用于产品runtime。实际录屏及decode使用的Playwright minimal ffmpeg原COPYING归档为 `vendor/licenses/playwright-ffmpeg-COPYING.LGPLv2.1.txt`；预览包不复制这些工具二进制。SDK具体commit以随附源版本记录为准，不编造版本，不改写原始组件源码、许可或通知。

版本以根目录 `package.json`/`pnpm-lock.yaml` 和实际本地许可证为准。`node_modules/` 默认不随轻量预览包整体复制；需要离线复现时由锁文件安装，清单列明许可位置。AGH SDK依赖清单不等于业务模型来源。项目不保存或分发API密钥。