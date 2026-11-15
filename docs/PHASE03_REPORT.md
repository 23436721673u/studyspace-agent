# 阶段03验证报告：三维资产

日期：2026-10-10。所有场景均标记为模拟场景；不存在实测、真实部署或真实用户试验结论。

## 实现

- `src/scene.mjs`：仅使用本项目自主参数化长方体，生成房间地板、分段墙体门洞、90度开启门扇、障碍柜、桌面、四桌腿、椅座、椅背和四椅腿。实体坐标为米，3D为 x/y/z、Y向上；使用空间和开门区作为非实体元数据。
- `src/glb.mjs`：GLB 2.0、嵌入BIN、POSITION/NORMAL/indices、TRIANGLES、PBR基础颜色、扁平节点TRS。
- `src/asset-check.mjs`：重新读取GLB二进制，校验头/块/引用/范围/有限顶点、正向三角形、六个轴向面各两三角形、面积和共享对角线；逐部件复核ID、owner、类别、世界包围尺寸与中心，并独立重算桌/椅 footprint，重新运行布局验收。
- `src/plan-svg.mjs`：生成带房间、门、障碍、桌、椅、使用空间、坐标方向和米制尺寸的二维图。
- `gltf-validator`：Khronos官方 npm 包，锁定 `2.0.0-dev.3.10`（Apache-2.0，来源见 `docs/SOURCES.md`）。报告单独保存为 `gltf-validator-report.json`，不能替代上述几何复核。

## 实际结果

最近一轮资产套件：`results/assets/2026-10-10T05-55-14.341Z-2f7b7a19-bd03-43ee-9938-0308ea59443b/`。

- 9 个正常/边界样例：全部 `pass`；包含0°、90°、混合朝向、障碍柜、不同门墙、6座样例。
- 6座资产：74个部件、888个三角形；GLB SHA-256：`c55d86ca22d91bfb2538c909c658783af5c4a99aa693252126e616576ebcce39`。
- 每个官方验证报告：`numErrors=0`、`numWarnings=0`，完整JSON保存在各样例目录。
- 8项故障注入：删对象、改位置、改尺寸、重复面、坏索引、顶点变形、截断、坏GLB头，全部按预期 `fail`，未把原始失败改写为成功。
- 资产套件汇总：17/17通过。
- 原有阶段02 fixture 回归：19/19通过，输出 `results/phase-02-fixtures-2026-10-10T05-55-14.606Z-cd1b59f8-ca9b-42ad-b4e4-41238c36daa5.json`。
- 独立复读 CLI 六座再验收：`results/asset-rechecks/d9ae96ba-04c8-4db4-a81c-f7184502b1d4.json`，状态 `pass`。

## 受限导入子集

本地查看器 `viewer.html` 在阶段03尚未进行浏览器视觉/交互验证，留到阶段05的项目隔离浏览器测试；它和自有复读器只承诺本项目导出的受限子集：GLB v2；单一内嵌BIN；单一场景；扁平节点；无 `matrix`、`rotation`、`children`、skin、外部URI或扩展；正尺寸节点TRS；每个mesh一个三角形primitive；POSITION/NORMAL/indices；单位米。它们不是通用glTF导入器。Khronos官方验证器负责标准层格式检查。

## 尚未完成

第三方许可材料：已读取 `node_modules/gltf-validator/LICENSE` 与 `node_modules/gltf-validator/NOTICES`；版本、Apache-2.0、NOTICE组成和保留要求见 `docs/THIRD_PARTY_NOTICES.md`。项目内许可证复制命令因审批等待600秒无人响应而未执行（不是策略拒绝），未重试；`docs/licenses/` 副本尚未生成。

AGH产品任务编排与真实AGH taskId证据、正式UI、一键设计、视频、PPT、提交ZIP和赛事最终核对仍是后续阶段工作。本阶段代码 runId/资产报告不是AGH taskId；当前报告不声称已完成这些交付物。
