/**
 * [INPUT]: 依赖宿主 iframe URL 的 locale 参数与浏览器语言
 * [OUTPUT]: 对外提供深度图 App 工作台的 zh/en 文案字典与 t(locale, key) 翻译入口
 * [POS]: ui/src 的语言边界；组件不硬编码用户可见文案，动态段用 {param} 占位符
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
export type Locale = "zh" | "en";
export type Translate = (key: string, params?: Record<string, string>) => string;

const zh: Record<string, string> = {
  "app.name": "深度图",

  "sdk.hostNotConnected": "Recut Host 尚未连接",

  "status.starting": "正在启动…",
  "status.ready.chooseModel": "请选择要下载的模型。",
  "status.jobRunning": "本地任务正在执行。",
  "status.historyLoadFailed": "无法读取历史输出。",
  "status.stateLoadFailed": "无法读取深度图状态。",
  "status.libraryLoadFailed": "无法读取素材库。",
  "status.syncFailed": "无法同步本地任务。",
  "status.finalizeFailed": "任务完成后无法刷新状态。",
  "status.resolveFailed": "无法确认任务终态。",
  "status.logsFailed": "无法读取本地任务日志。",

  "install.starting": "正在安装运行环境并下载 {model} 模型…",
  "install.downloading": "正在下载 {model} 模型…",
  "install.failed": "安装失败。",

  "prepare.failed": "暂时无法启动。",

  "generate.needAsset": "先选择一张图片或一个视频素材。",
  "generate.video": "正在逐帧计算深度图，视频处理会花更长时间。",
  "generate.image": "正在生成深度图…",
  "generate.failed": "生成失败。",

  "cancel.stopping": "正在停止本地任务…",
  "cancel.none": "没有可停止的本地任务。",
  "cancel.failed": "无法停止本地任务。",

  "pick.picked.image": "已选择图片素材：{name}",
  "pick.picked.video": "已选择视频素材：{name}",
  "pick.failed": "无法打开素材选择器。",

  "upload.type.image": "请上传图片文件。",
  "upload.type.video": "请上传视频文件。",
  "upload.failed": "上传失败。",
  "upload.added": "输入素材已加入素材库并选中。",

  "save.done": "已保存到素材库。",
  "save.failed": "保存失败。",

  "agent.prompt": "深度图本地依赖检查或安装失败。请检查并解决这个错误，然后告诉我可以如何继续：{detail}",
  "agent.filled": "诊断已填入右侧 Agent 输入框；请确认后发送。",
  "agent.failed": "无法准备诊断请求。",

  "finish.incomplete": "本地任务未完成。",
  "finish.previewReady": "深度预览已生成，尚未进入素材库。",
  "finish.envNotReady": "运行环境检查尚未完成，请重新尝试。",
  "finish.prepareReady": "运行环境已就绪，请选择要下载的模型。",
  "finish.installReady": "模型下载完成，可以开始转换。",

  "setup.startingTitle": "正在启动",
  "setup.intro": "首次使用需要一点时间，完成后即可选择模型并开始转换。",
  "setup.ariaLog": "准备过程",
  "setup.startingEnv": "正在启动本地运行环境…",
  "setup.failedTitle": "暂时无法启动",
  "setup.askAgent": "交给右侧 Codex 处理",
  "setup.retry": "重新尝试",
  "setup.startingButton": "正在启动…",

  "header.eyebrow": "RECUT APP / 深度图",
  "header.title": "深度图",
  "header.subtitle": "将图片或视频转换为深度图。预览不会自动进入素材库。",

  "controls.section.input": "输入",
  "controls.input.title": "选择素材",
  "controls.kind.image": "图片",
  "controls.kind.video": "视频",
  "controls.library": "素材库",
  "controls.change": "更换素材",
  "controls.pick.image": "从素材库选择图片",
  "controls.pick.video": "从素材库选择视频",
  "controls.upload.image": "上传图片",
  "controls.upload.video": "上传视频",
  "controls.section.model": "模型",
  "controls.model.title": "本地权重",
  "controls.modelSize": "模型尺寸",
  "controls.downloaded": "已下载",
  "controls.downloadModel": "下载此模型",
  "controls.section.output": "输出",
  "controls.output.title": "深度图样式",
  "controls.style.color": "伪彩",
  "controls.style.grayscale": "灰度",
  "controls.generate.running": "正在生成…",
  "controls.generate": "生成深度图",

  "model.note.small": "最快，适合快速预览",
  "model.note.base": "质量与速度平衡",
  "model.note.large": "细节和视频稳定性更好",

  "output.section.preview": "预览",
  "output.title": "本次输出",
  "output.savedPill": "已保存",
  "output.privatePill": "私有预览",
  "output.alt": "本次生成的深度图",
  "output.empty": "选择素材并生成后，深度预览会显示在这里。",
  "output.style.color": "伪彩",
  "output.style.grayscale": "灰度",
  "output.hint": "先预览，再自行决定是否保存到素材库。",
  "output.saved": "素材库已保存",
  "output.save": "保存到素材库",

  "bottom.aria": "输出记录",
  "bottom.history": "历史",
  "bottom.logs": "执行日志",
  "bottom.cancel.running": "正在停止",
  "bottom.cancel": "停止任务",
  "bottom.logs.empty": "正在等待任务输出…",

  "history.section.history": "历史",
  "history.title": "全部输出",
  "history.count": "{count} 条",
  "history.alt": "历史深度图",
  "history.kind.image": "图片",
  "history.kind.video": "视频",
  "history.saved": "已保存到素材库",
  "history.save": "保存到素材库",
  "history.empty": "还没有历史输出。",

  "jobtimer.running": "任务运行中 · {elapsed}",

  "preview.aria": "深度输出预览",
  "preview.close": "关闭预览",
  "preview.alt": "历史深度图预览",

  "source.selected.alt": "已选素材：{name}",
  "source.selected": "已选择",
};

const en: Record<string, string> = {
  "app.name": "Depth Map",

  "sdk.hostNotConnected": "Recut Host is not connected yet",

  "status.starting": "Starting…",
  "status.ready.chooseModel": "Choose a model to download.",
  "status.jobRunning": "A local task is running.",
  "status.historyLoadFailed": "Unable to read history outputs.",
  "status.stateLoadFailed": "Unable to read depth map status.",
  "status.libraryLoadFailed": "Unable to read the media library.",
  "status.syncFailed": "Unable to sync the local task.",
  "status.finalizeFailed": "Unable to refresh state after the task completed.",
  "status.resolveFailed": "Unable to confirm the terminal task state.",
  "status.logsFailed": "Unable to read the local task logs.",

  "install.starting": "Installing the runtime and downloading the {model} model…",
  "install.downloading": "Downloading the {model} model…",
  "install.failed": "Installation failed.",

  "prepare.failed": "Unable to start right now.",

  "generate.needAsset": "Select an image or video asset first.",
  "generate.video": "Computing depth per frame; video takes longer.",
  "generate.image": "Generating depth map…",
  "generate.failed": "Generation failed.",

  "cancel.stopping": "Stopping the local task…",
  "cancel.none": "No running task to stop.",
  "cancel.failed": "Unable to stop the local task.",

  "pick.picked.image": "Selected image asset: {name}",
  "pick.picked.video": "Selected video asset: {name}",
  "pick.failed": "Unable to open the asset picker.",

  "upload.type.image": "Please upload an image file.",
  "upload.type.video": "Please upload a video file.",
  "upload.failed": "Upload failed.",
  "upload.added": "The input asset was added to the library and selected.",

  "save.done": "Saved to the media library.",
  "save.failed": "Save failed.",

  "agent.prompt": "Depth map local dependency check or installation failed. Please inspect and fix this error, then tell me how to proceed: {detail}",
  "agent.filled": "The diagnostic is in the right-hand Agent input; review and send it.",
  "agent.failed": "Unable to prepare the diagnostic request.",

  "finish.incomplete": "The local task did not complete.",
  "finish.previewReady": "Depth preview generated; not yet added to the library.",
  "finish.envNotReady": "Environment check is not complete; please try again.",
  "finish.prepareReady": "Environment is ready; choose a model to download.",
  "finish.installReady": "Model downloaded; you can start converting.",

  "setup.startingTitle": "Starting",
  "setup.intro": "The first run takes a little time; then you can pick a model and start converting.",
  "setup.ariaLog": "Preparation log",
  "setup.startingEnv": "Starting the local runtime…",
  "setup.failedTitle": "Unable to start",
  "setup.askAgent": "Ask right-side Codex",
  "setup.retry": "Retry",
  "setup.startingButton": "Starting…",

  "header.eyebrow": "RECUT APP / Depth Map",
  "header.title": "Depth Map",
  "header.subtitle": "Convert images or videos into depth maps. Previews are not added to the library automatically.",

  "controls.section.input": "Input",
  "controls.input.title": "Choose source",
  "controls.kind.image": "Image",
  "controls.kind.video": "Video",
  "controls.library": "Media library",
  "controls.change": "Change source",
  "controls.pick.image": "Choose image from library",
  "controls.pick.video": "Choose video from library",
  "controls.upload.image": "Upload image",
  "controls.upload.video": "Upload video",
  "controls.section.model": "Model",
  "controls.model.title": "Local weights",
  "controls.modelSize": "Model size",
  "controls.downloaded": "Downloaded",
  "controls.downloadModel": "Download this model",
  "controls.section.output": "Output",
  "controls.output.title": "Depth map style",
  "controls.style.color": "Color",
  "controls.style.grayscale": "Grayscale",
  "controls.generate.running": "Generating…",
  "controls.generate": "Generate depth map",

  "model.note.small": "Fastest, great for quick previews",
  "model.note.base": "Balanced quality and speed",
  "model.note.large": "Better detail and video stability",

  "output.section.preview": "Preview",
  "output.title": "Current output",
  "output.savedPill": "Saved",
  "output.privatePill": "Private preview",
  "output.alt": "Generated depth map",
  "output.empty": "Pick a source and generate; the depth preview will appear here.",
  "output.style.color": "Color",
  "output.style.grayscale": "Grayscale",
  "output.hint": "Preview first, then decide whether to save to the library.",
  "output.saved": "Saved to library",
  "output.save": "Save to library",

  "bottom.aria": "Output records",
  "bottom.history": "History",
  "bottom.logs": "Run log",
  "bottom.cancel.running": "Stopping",
  "bottom.cancel": "Stop task",
  "bottom.logs.empty": "Waiting for task output…",

  "history.section.history": "History",
  "history.title": "All outputs",
  "history.count": "{count} items",
  "history.alt": "Depth map history",
  "history.kind.image": "Image",
  "history.kind.video": "Video",
  "history.saved": "Saved to library",
  "history.save": "Save to library",
  "history.empty": "No history outputs yet.",

  "jobtimer.running": "Task running · {elapsed}",

  "preview.aria": "Depth output preview",
  "preview.close": "Close preview",
  "preview.alt": "History depth map preview",

  "source.selected.alt": "Selected source: {name}",
  "source.selected": "Selected",
};

const dictionaries: Record<Locale, Record<string, string>> = { zh, en };

export function translate(locale: Locale, key: string, params?: Record<string, string>): string {
  const template = dictionaries[locale][key] ?? dictionaries.zh[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? params[name] : placeholder));
}
