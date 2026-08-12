---
name: depth-anything
description: 对图片或视频执行深度估计并保存深度图结果。
---

# Depth Anything 执行约束

此 App 只使用 `depth.status`、`depth.prepare`、`depth.install`、`depth.generate`、`depth.complete`、`depth.list` 和 `depth.save` 的公开契约。

- 应用进入时先自动调用 `depth.status -> depth.prepare`；运行依赖未就绪时不能开放工作台。生成前再确认用户选择的模型已经下载。
- 图片和视频输入都必须是已完成的 Recut Media Asset；`depth.generate` 只将其复制到 App 私有文件目录。
- 输出 PNG 或 MP4 先作为私有预览。`depth.generate` 只提交 Job，`depth.complete` 在 Job 成功后取得预览；只有用户明确点击保存后，才允许调用 `depth.save` 创建素材库 Asset。
- 所有耗时操作（`depth.prepare` / `depth.install` / `depth.generate`）都是异步提交、立即返回 job；用平台 `recut.job.status` / `recut.job.wait` 轮询终态，失败用 `recut.job.logs` 诊断、`recut.job.cancel` 取消，不要用同步等待代替轮询。`depth.status` 的 activeJob 只用于确认当前 App 任务归属。
- Python venv、依赖和路径只由 `manifest.runtime.python` 与平台 `ctx.python` 管理；`bootstrap.py` 只能做跨平台的自由兜底，不能重建 venv 或重复 pip 安装。
- 依赖、模型下载或推理失败时，保留原始错误。不要编造生成结果、假设模型已安装，或绕开 App 直接写入 `.recut/models`。

[PROTOCOL]: 变更时更新此头部，然后检查 README.md
