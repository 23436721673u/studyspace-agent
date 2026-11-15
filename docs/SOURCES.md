# 来源清单（当前提交预览）

- 本项目产品/方法：本仓库的 `src/`、`bin/`、`tests/` 与模拟输入。房间、桌椅、障碍和布局均由参数化代码生成；无外部3D模型、纹理或调研数据。
- AGH SDK：官方 Node SDK 随附源文件 `vendor/agh/agh-sdk.mjs` 及原始 `vendor/agh/LICENSE`；依赖许可按源包和捆绑通知核验，不改写原始文本。
- `three@0.180.0`：由本地锁定依赖供HTTP工作台/WebGL查看器使用。上游 `https://github.com/mrdoob/three.js`；本地 `node_modules/three/LICENSE`。
- `gltf-validator@2.0.0-dev.3.10`：Khronos GLB格式验证器，Apache-2.0。上游 `https://github.com/KhronosGroup/glTF-Validator`；本地LICENSE/NOTICES含Dart及随附组件通知。其报告只验证GLB格式，不证明布局或规范合规。
- `playwright@1.56.1`：本地浏览器测试/录屏自动化。上游 `https://github.com/microsoft/playwright`；本地包许可与 `ThirdPartyNotices.txt` 按分发要求保留。使用系统Edge渠道时不将浏览器程序打包。
- glTF格式依据：Khronos glTF 2.0规范 `https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html`；仅作GLB结构来源索引。
- 模型：产品真实任务记录显示 `gpt-6-astra`、ToTokens `https://totokens.cc/v1` Responses、route `account-studyspace-astra-api`。底层提供方及不可变版本未独立核实；AGH驱动ID不等于模型提供方。模型使用清单见 `MODEL_USAGE.json`。
- 赛事：规则相关原文节选由用户提供；最终材料保留规则冲突说明，提交前应由学生核对完整赛事条款。不构成官方赛事背书。
- 演示媒体：旧版完整闭环录像和新版工作台录像均为本项目实际录制文件；转码参数、源/输出SHA-256、212.202646秒时长和全量decode结果见随包媒体报告。新版录像中的历史回放、连接异常及录像结束后才完成的任务按原记录说明。

最终随包许可位于 `vendor/licenses/`，替代以上 node_modules 位置作为提交包中的许可索引。AGH SDK为官方commit对应源码的编译模块；具体来源版本以随附源记录为准，不推断未知commit。SDK Apache许可及捆绑的 `ws@8.21.3`、`typebox@0.34.33` 原许可均已归档；three、gltf-validator、Playwright/core的原许可与通知同目录保留。`ffmpeg-static`仅用于开发环境，未用于产品runtime；实际录屏及decode使用的Playwright minimal ffmpeg原COPYING已归档为 `vendor/licenses/playwright-ffmpeg-COPYING.LGPLv2.1.txt`，不复制工具二进制。

许可归档清单见 `THIRD_PARTY_NOTICES.md`。原始组件源码、许可证和NOTICE不得为展示而篡改。