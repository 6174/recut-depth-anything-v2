/*
 * [INPUT]: 依赖 ctx.sqlite 保存运行记录，ctx.media 复制/显式导入素材，ctx.files 生成私有预览 URL，ctx.python 与 ctx.shell 执行可观察本地任务
 * [OUTPUT]: 注册环境检查、模型安装、深度生成、预览历史与用户确认入库 operation
 * [POS]: depth-anything 的唯一业务后端；输出先停留在 App 文件沙箱，绝不在生成时自动创建素材库 Asset
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */

const MODELS = { small: "vits", base: "vitb", large: "vitl" };
const KINDS = new Set(["image", "video"]);
const STYLES = new Set(["color", "grayscale"]);
const ACTIONS = new Set(["prepare", "install", "generate"]);
const ACTIVE_JOB_STATUSES = new Set(["queued", "running"]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled", "interrupted"]);

function value(input, name) { return String(input[name] || "").trim(); }
function model(input) { const selected = value(input, "model"); if (!MODELS[selected]) throw new Error("model must be small, base, or large"); return selected; }
function outputID() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function messages(locale) {
  const zh = locale !== "en";
  return {
    activeJobBusy: zh ? "深度图已有任务正在执行，请等待完成或先取消。" : "A depth task is already running; wait for it to finish or cancel it first.",
    jobUnrecoverable: (detail) => zh ? `任务记录不可恢复：${detail}` : `Job record is unrecoverable: ${detail}`,
    jobStatusUnknown: (status) => zh ? `任务状态不可识别：${status}` : `Unknown job status: ${status}`,
    startFailed: zh ? "无法启动深度任务。" : "Unable to start the depth task.",
    previewMissing: zh ? "深度预览文件已丢失。" : "The depth preview file is missing.",
  };
}

function ensureSchema(ctx) {
  ctx.sqlite.execute("create table if not exists depth_outputs (id text primary key, asset_id text not null, kind text not null, model text not null, style text not null, file_path text not null, mime_type text not null, saved_asset_id text not null default '', created_at text not null, job_id text not null default '', status text not null default 'completed', error text not null default '')");
  ctx.sqlite.execute("create table if not exists depth_jobs (job_id text primary key, action text not null, output_id text not null default '', started_at text not null, resolved_at text not null default '')");
  const outputColumns = new Set(ctx.sqlite.query("pragma table_info(depth_outputs)").map((column) => String(column.name)));
  if (!outputColumns.has("job_id")) ctx.sqlite.execute("alter table depth_outputs add column job_id text not null default ''");
  if (!outputColumns.has("status")) ctx.sqlite.execute("alter table depth_outputs add column status text not null default 'completed'");
  if (!outputColumns.has("error")) ctx.sqlite.execute("alter table depth_outputs add column error text not null default ''");
}

function parseProcess(result) {
  const lines = String(result.stdout || "").trim().split("\n").filter(Boolean);
  const last = lines[lines.length - 1] || "{}";
  let payload;
  try { payload = JSON.parse(last); } catch (_) { payload = { ready: false, error: String(result.stdout || result.error || "Python did not return a status payload.") }; }
  if (Number(result.exitCode) !== 0) payload.error = payload.error || String(result.stdout || result.error || "Python process failed.");
  return payload;
}

function run(ctx, args, timeoutSeconds) {
  return parseProcess(ctx.shell.exec({ command: "python3", args: ["python/depth_runner.py", ...args], environment: "depth-anything-v2", timeoutSeconds }));
}

function shellJobID(job) { return String(job.id || job.ID || "").trim(); }
function shellJobStatus(job) { return String(job.status || job.Status || "").trim(); }
function shellJobError(job) { return String(job.error || job.Error || "").trim(); }
function isActiveJob(status) { return ACTIVE_JOB_STATUSES.has(status); }
function isTerminalJob(status) { return TERMINAL_JOB_STATUSES.has(status); }
function outputStatus(status) { return status === "completed" ? "completed" : "failed"; }

function settleOutput(ctx, outputID, job) {
  if (!outputID || !isTerminalJob(job.status)) return;
  ctx.sqlite.execute("update depth_outputs set status = ?, error = ? where id = ?", [outputStatus(job.status), job.error || job.status, outputID]);
}

function resolveTrackedJob(ctx, record, job) {
  settleOutput(ctx, record.output_id, job);
  return { id: record.job_id, action: record.action, outputID: record.output_id, startedAt: record.started_at, status: job.status, error: job.error || "", logs: ctx.shell.logs(record.job_id).slice(-80) };
}

function ensureNoActiveJob(ctx) {
  ensureSchema(ctx);
  const existing = trackedJob(ctx);
  if (existing && isActiveJob(existing.status)) throw new Error(messages(ctx.locale).activeJobBusy);
  if (existing) ctx.sqlite.execute("update depth_jobs set resolved_at = ? where job_id = ?", [new Date().toISOString(), existing.id]);
}

function trackJob(ctx, job, action, outputID = "") {
  ensureSchema(ctx);
  const id = shellJobID(job);
  if (!id || !ACTIONS.has(action)) throw new Error("Depth task did not return a valid shell job id.");
  const now = new Date().toISOString();
  ctx.sqlite.execute("update depth_jobs set resolved_at = ? where resolved_at = ''", [now]);
  ctx.sqlite.execute("insert into depth_jobs (job_id, action, output_id, started_at, resolved_at) values (?, ?, ?, ?, '')", [id, action, outputID, now]);
  return job;
}

function trackedJob(ctx) {
  ensureSchema(ctx);
  const rows = ctx.sqlite.query("select job_id, action, output_id, started_at from depth_jobs where resolved_at = '' order by started_at desc limit 1");
  if (!rows.length) return null;
  const record = rows[0];
  if (!record.job_id || !ACTIONS.has(record.action)) {
    ctx.sqlite.execute("update depth_jobs set resolved_at = ? where job_id = ?", [new Date().toISOString(), record.job_id]);
    return null;
  }
  let job;
  try { job = ctx.shell.status(record.job_id); }
  catch (error) {
    const message = error instanceof Error ? error.message : "shell job is unavailable";
    const interrupted = { status: "interrupted", error: messages(ctx.locale).jobUnrecoverable(message) };
    settleOutput(ctx, record.output_id, interrupted);
    return { id: record.job_id, action: record.action, outputID: record.output_id, startedAt: record.started_at, status: interrupted.status, error: interrupted.error, logs: [] };
  }
  const status = shellJobStatus(job);
  if (!isActiveJob(status) && !isTerminalJob(status)) {
    const interrupted = { status: "interrupted", error: messages(ctx.locale).jobStatusUnknown(status || "empty") };
    settleOutput(ctx, record.output_id, interrupted);
    return { id: record.job_id, action: record.action, outputID: record.output_id, startedAt: record.started_at, status: interrupted.status, error: interrupted.error, logs: [] };
  }
  return resolveTrackedJob(ctx, record, { status, error: shellJobError(job) });
}

function status(_, ctx) {
  const activeJob = trackedJob(ctx);
  const environment = ctx.python.status();
  if (!environment.ready) return { ready: false, pending: true, installedModels: [], modelsRoot: "~/.recut/models/depth-anything-v2", error: environment.error || "", activeJob };
  return { ...run(ctx, ["status"], 20), activeJob };
}

function prepare(_, ctx) {
  ensureNoActiveJob(ctx);
  return { job: trackJob(ctx, ctx.python.prepare(), "prepare") };
}

function install(input, ctx) {
  const selected = model(input);
  ensureNoActiveJob(ctx);
  return { job: trackJob(ctx, ctx.python.run(["python/depth_runner.py", "install", "--model", selected]), "install") };
}

function generate(input, ctx) {
  ensureSchema(ctx);
  const assetID = value(input, "assetId");
  const kind = value(input, "kind");
  const selected = model(input);
  const style = value(input, "style");
  if (!assetID || !KINDS.has(kind) || !STYLES.has(style)) throw new Error("assetId, kind, model and style are required");
  ensureNoActiveJob(ctx);
  const source = ctx.media.materialize(assetID);
  if (source.kind !== kind) throw new Error(`Selected Asset is ${source.kind}, not ${kind}.`);
  const id = outputID();
  const extension = kind === "image" ? "png" : "mp4";
  const path = `outputs/${id}.${extension}`;
  const output = { id, assetId: assetID, kind, model: selected, style, filePath: path, mimeType: kind === "image" ? "image/png" : "video/mp4", savedAssetId: "", createdAt: new Date().toISOString(), jobId: "", status: "queued", error: "" };
  ctx.sqlite.execute("insert into depth_outputs (id, asset_id, kind, model, style, file_path, mime_type, saved_asset_id, created_at, job_id, status, error) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [output.id, output.assetId, output.kind, output.model, output.style, output.filePath, output.mimeType, output.savedAssetId, output.createdAt, output.jobId, output.status, output.error]);
  try {
    const job = ctx.python.run(["python/depth_runner.py", "infer", "--model", selected, "--style", style, "--kind", kind, "--input", source.path, "--output", path]);
    const tracked = trackJob(ctx, job, "generate", output.id);
    output.jobId = shellJobID(tracked);
    ctx.sqlite.execute("update depth_outputs set job_id = ? where id = ?", [output.jobId, output.id]);
    return { job: tracked, output: { ...output, previewURL: "" } };
  } catch (error) {
    ctx.sqlite.execute("update depth_outputs set status = 'failed', error = ? where id = ?", [error instanceof Error ? error.message : messages(ctx.locale).startFailed, output.id]);
    throw error;
  }
}

function present(output, ctx) { return { ...output, previewURL: ctx.files.url(output.filePath) }; }

function presentCompletedOutput(ctx, row) {
  const output = { id: row.id, assetId: row.asset_id, kind: row.kind, model: row.model, style: row.style, filePath: row.file_path, mimeType: row.mime_type, savedAssetId: row.saved_asset_id, createdAt: row.created_at };
  try { return present(output, ctx); }
  catch (error) {
    ctx.sqlite.execute("update depth_outputs set status = 'failed', error = ? where id = ?", [error instanceof Error ? error.message : messages(ctx.locale).previewMissing, output.id]);
    return null;
  }
}

function list(_, ctx) {
  ensureSchema(ctx);
  trackedJob(ctx);
  return ctx.sqlite.query("select id, asset_id, kind, model, style, file_path, mime_type, saved_asset_id, created_at from depth_outputs where status = 'completed' order by created_at desc").map((row) => presentCompletedOutput(ctx, row)).filter(Boolean);
}

function complete(input, ctx) {
  ensureSchema(ctx);
  const id = value(input, "id");
  trackedJob(ctx);
  const rows = ctx.sqlite.query("select id, asset_id, kind, model, style, file_path, mime_type, saved_asset_id, created_at from depth_outputs where id = ? and status = 'completed'", [id]);
  if (!rows.length) throw new Error("Depth output was not found.");
  const output = presentCompletedOutput(ctx, rows[0]);
  if (!output) throw new Error("Depth output file is missing.");
  return output;
}

function job(_, ctx) {
  return trackedJob(ctx);
}

function resolveJob(input, ctx) {
  ensureSchema(ctx);
  const id = value(input, "id");
  const active = trackedJob(ctx);
  if (!active || active.id !== id) return { id, resolved: false };
  if (isActiveJob(active.status)) throw new Error("Depth task is still running.");
  ctx.sqlite.execute("update depth_jobs set resolved_at = ? where job_id = ?", [new Date().toISOString(), id]);
  return { id, resolved: true };
}

function cancel(_, ctx) {
  const active = trackedJob(ctx);
  if (!active || !isActiveJob(active.status)) return { cancelled: false };
  ctx.shell.cancel(active.id);
  return { cancelled: true, id: active.id };
}

function save(input, ctx) {
  ensureSchema(ctx);
  const id = value(input, "id");
  const rows = ctx.sqlite.query("select id, kind, file_path, mime_type, saved_asset_id from depth_outputs where id = ? and status = 'completed'", [id]);
  if (!rows.length) throw new Error("Depth output was not found.");
  const output = rows[0];
  if (!output.saved_asset_id) {
    const asset = ctx.media.importFile({ path: output.file_path, name: `depth-${output.id}.${output.kind === "image" ? "png" : "mp4"}`, mimeType: output.mime_type });
    ctx.sqlite.execute("update depth_outputs set saved_asset_id = ? where id = ?", [asset.id, output.id]);
    output.saved_asset_id = asset.id;
  }
  return { id: output.id, assetId: output.saved_asset_id };
}

recut.operation.register("depth.status", status);
recut.operation.register("depth.prepare", prepare);
recut.operation.register("depth.install", install);
recut.operation.register("depth.generate", generate);
recut.operation.register("depth.list", list);
recut.operation.register("depth.complete", complete);
recut.operation.register("depth.job", job);
recut.operation.register("depth.resolve", resolveJob);
recut.operation.register("depth.cancel", cancel);
recut.operation.register("depth.save", save);
