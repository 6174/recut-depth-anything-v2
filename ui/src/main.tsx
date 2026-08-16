/**
 * [INPUT]: 依赖 Recut SDK、Depth operation、平台素材选择器、素材库上传 HTTP、React 状态与 i18n 字典
 * [OUTPUT]: 对外提供简洁的环境安装、模型下载、平台素材挑选与预览、应用内选择组件、可打开的图像/视频预览、全量历史、实时计时/日志、任务停止和用户确认入库工作台；运行中的任务持续更新日志但尊重用户选定的底部标签
 * [POS]: depth-anything UI 编排层；仅在环境和选定模型就绪后开放推理，生成结果先留在 App 私有文件区
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleStop, Clock3, Download, FolderOpen, Image, LoaderCircle, Save, Send, Upload, Video, X } from "lucide-react";
import { recut, useRecutLocale } from "./recut-sdk";
import { translate } from "./i18n";
import type { Locale, Translate } from "./i18n";
import type { ActiveDepthJob, DepthOutput, MediaAsset, Model, OutputStyle, RuntimeStatus, ShellJob, ShellJobLog, SourceKind } from "./types";
import "./style.css";

const models: { id: Model; label: string; noteKey: string }[] = [
  { id: "small", label: "Small", noteKey: "model.note.small" },
  { id: "base", label: "Base", noteKey: "model.note.base" },
  { id: "large", label: "Large", noteKey: "model.note.large" },
];

type ActiveJob = { id: string; action: "prepare" | "install" | "generate"; outputID?: string; startedAt: number; status: ShellJob["status"]; error?: string };

function isTerminal(status: ShellJob["status"]) { return status !== "queued" && status !== "running"; }
function isValidActiveJob(job: ActiveDepthJob | null | undefined): job is ActiveDepthJob { return Boolean(job?.id && (job.action === "prepare" || job.action === "install" || job.action === "generate") && ["queued", "running", "completed", "failed", "cancelled", "interrupted"].includes(job.status)); }
function logText(logs: ShellJobLog[]) { return logs.map((entry) => entry.text).join(""); }
function mergeLogs(current: ShellJobLog[], next: ShellJobLog[]) { return [...new Map([...current, ...next].map((entry) => [entry.sequence, entry])).values()].sort((left, right) => left.sequence - right.sequence).slice(-80); }
function jobStartedAt(startedAt?: string) { const value = Date.parse(startedAt || ""); return Number.isNaN(value) ? Date.now() : value; }
function formatElapsed(totalSeconds: number) { const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0"); const seconds = (totalSeconds % 60).toString().padStart(2, "0"); return `${minutes}:${seconds}`; }
function formatDate(locale: Locale, value: string) { return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US"); }
function modelLabel(id: Model) { return models.find((item) => item.id === id)?.label ?? id; }

function App() {
  const locale = useRecutLocale();
  const t = useMemo<Translate>(() => (key, params) => translate(locale, key, params), [locale]);
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [outputs, setOutputs] = useState<DepthOutput[]>([]);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [sourceKind, setSourceKind] = useState<SourceKind>("image");
  const [assetId, setAssetId] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [model, setModel] = useState<Model>("small");
  const [style, setStyle] = useState<OutputStyle>("color");
  const [busy, setBusy] = useState<"prepare" | "install" | "generate" | "save" | "upload" | "agent" | null>(null);
  const [message, setMessage] = useState(() => t("status.starting"));
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [logs, setLogs] = useState<ShellJobLog[]>([]);
  const [bottomTab, setBottomTab] = useState<"history" | "logs">("history");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewOutput, setPreviewOutput] = useState<DepthOutput | null>(null);
  const [failure, setFailure] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const finalizingJob = useRef<string | null>(null);
  const bottomTabSelectedByUser = useRef(false);

  const selectBottomTab = useCallback((tab: "history" | "logs") => {
    bottomTabSelectedByUser.current = true;
    setBottomTab(tab);
  }, []);
  const showLogsForNewJob = useCallback(() => {
    bottomTabSelectedByUser.current = false;
    setBottomTab("logs");
  }, []);

  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; document.title = t("app.name"); }, [locale, t]);

  const refresh = useCallback(async (): Promise<RuntimeStatus | null> => {
    try {
      const nextStatus = await recut.state.query("depth.status") as RuntimeStatus;
      setStatus(nextStatus);
      setMessage(nextStatus.activeJob && isValidActiveJob(nextStatus.activeJob) ? t("status.jobRunning") : nextStatus.ready ? t("status.ready.chooseModel") : t("status.starting"));
      try { setOutputs(await recut.state.query("depth.list") as DepthOutput[]); }
      catch (error) { setMessage(error instanceof Error ? error.message : t("status.historyLoadFailed")); }
      return nextStatus;
    } catch (error) { setMessage(error instanceof Error ? error.message : t("status.stateLoadFailed")); }
    return null;
  }, [t]);

  const loadAssets = useCallback(async (): Promise<MediaAsset[]> => {
    const response = await fetch("/v1/media/assets");
    if (!response.ok) throw new Error(t("status.libraryLoadFailed"));
    const next = await response.json() as MediaAsset[];
    const completed = next.filter((asset) => asset.status === "completed" && (asset.kind === "image" || asset.kind === "video"));
    setAssets(completed); return completed;
  }, [t]);

  const restoreJob = useCallback((job: ActiveDepthJob) => {
    if (!isValidActiveJob(job)) return;
    setLogs(job.logs);
    setElapsedSeconds(Math.floor((Date.now() - jobStartedAt(job.startedAt)) / 1000));
    if (!bottomTabSelectedByUser.current) setBottomTab("logs");
    setBusy(job.action);
    setActiveJob({ id: job.id, action: job.action, outputID: job.outputID, startedAt: jobStartedAt(job.startedAt), status: job.status, error: job.error });
  }, []);

  const syncJob = useCallback(async () => {
    const job = await recut.state.query("depth.job") as ActiveDepthJob | null;
    if (isValidActiveJob(job)) restoreJob(job);
    else { setActiveJob(null); setBusy(null); setCancelling(false); }
  }, [restoreJob]);

  useEffect(() => { window.addEventListener("recut-sdk-ready", refresh); void refresh(); return () => window.removeEventListener("recut-sdk-ready", refresh); }, [refresh]);
  useEffect(() => { void loadAssets().catch((error) => setMessage(error.message)); }, [loadAssets]);
  useEffect(() => { if (isValidActiveJob(status?.activeJob)) restoreJob(status.activeJob); }, [restoreJob, status?.activeJob]);
  useEffect(() => {
    if (!activeJob) return;
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - activeJob.startedAt) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [activeJob]);
  useEffect(() => {
    if (!activeJob || isTerminal(activeJob.status)) return;
    const timer = window.setInterval(() => { void syncJob().catch((error) => setMessage(error instanceof Error ? error.message : t("status.syncFailed"))); }, 1000);
    return () => window.clearInterval(timer);
  }, [activeJob, syncJob, t]);
  useEffect(() => recut.events.subscribe((raw) => {
    const event = raw as { type?: string; log?: ShellJobLog; job?: ShellJob };
    if (event.type === "shell.job.log" && event.log?.jobId === activeJob?.id) setLogs((items) => mergeLogs(items, [event.log as ShellJobLog]));
    if (event.type !== "shell.job.completed" || event.job?.id !== activeJob?.id) return;
    setActiveJob((current) => current && current.id === event.job?.id ? { ...current, status: event.job.status, error: event.job.error } : current);
  }), [activeJob]);

  const finishJob = useCallback(async (job: ActiveJob) => {
    if (finalizingJob.current === job.id) return;
    finalizingJob.current = job.id;
    try {
      if (job.status !== "completed") {
        const error = job.error || t("finish.incomplete");
        setFailure(error); setMessage(error);
      } else if (job.action === "generate" && job.outputID) {
        const output = await recut.background.call("depth.complete", { id: job.outputID }) as DepthOutput;
        setOutputs((items) => [output, ...items.filter((item) => item.id !== output.id)]); setMessage(t("finish.previewReady"));
      } else {
        const nextStatus = await refresh();
        if (!nextStatus?.ready) {
          const error = nextStatus?.error || t("finish.envNotReady");
          setFailure(error); setMessage(error); return;
        }
        setMessage(job.action === "prepare" ? t("finish.prepareReady") : t("finish.installReady"));
      }
    } catch (error) { const message = error instanceof Error ? error.message : t("status.finalizeFailed"); setFailure(message); setMessage(message); }
    finally {
      try { await recut.background.call("depth.resolve", { id: job.id }); }
      catch (error) { setMessage(error instanceof Error ? error.message : t("status.resolveFailed")); }
      setBusy(null); setActiveJob((current) => current?.id === job.id ? null : current); finalizingJob.current = null;
    }
  }, [refresh, t]);
  useEffect(() => { if (activeJob && isTerminal(activeJob.status)) void finishJob(activeJob); }, [activeJob, finishJob]);

  const compatibleAssets = useMemo(() => assets.filter((asset) => asset.kind === sourceKind), [assets, sourceKind]);
  const sourceAsset = selectedAsset?.id === assetId ? selectedAsset : compatibleAssets.find((asset) => asset.id === assetId) ?? null;
  const readyModel = Boolean(status?.installedModels.includes(model));
  const currentOutput = outputs[0];

  const beginJob = (job: ShellJob, action: "prepare" | "install" | "generate", outputID?: string) => {
    setElapsedSeconds(0);
    setActiveJob({ id: job.id, action, outputID, startedAt: jobStartedAt(job.startedAt), status: job.status, error: job.error });
    void syncJob().catch((error) => setMessage(error instanceof Error ? error.message : t("status.logsFailed")));
  };

  const install = async () => {
    setBusy("install");
    setFailure("");
    showLogsForNewJob();
    setLogs([]);
    setMessage(t("install.starting", { model: modelLabel(model) }));
    try { const result = await recut.background.call("depth.install", { model }) as { job: ShellJob }; beginJob(result.job, "install"); setMessage(t("install.downloading", { model: modelLabel(model) })); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("install.failed")); setBusy(null); }
  };

  const prepare = useCallback(async () => {
    setBusy("prepare");
    setFailure("");
    showLogsForNewJob();
    setLogs([]);
    setMessage(t("status.starting"));
    try { const result = await recut.background.call("depth.prepare") as { job: ShellJob }; beginJob(result.job, "prepare"); }
    catch (error) { const message = error instanceof Error ? error.message : t("prepare.failed"); setFailure(message); setMessage(message); setBusy(null); }
  }, [t]);

  const generate = async () => {
    if (!assetId) return setMessage(t("generate.needAsset"));
    setBusy("generate");
    showLogsForNewJob();
    setLogs([]);
    setMessage(sourceKind === "video" ? t("generate.video") : t("generate.image"));
    try { const result = await recut.background.call("depth.generate", { assetId, kind: sourceKind, model, style }) as { job: ShellJob; output: { id: string } }; beginJob(result.job, "generate", result.output.id); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("generate.failed")); setBusy(null); }
  };

  const cancel = async () => {
    if (!activeJob || isTerminal(activeJob.status)) return;
    setCancelling(true);
    try {
      const result = await recut.background.call("depth.cancel") as { cancelled: boolean };
      setMessage(result.cancelled ? t("cancel.stopping") : t("cancel.none"));
      void syncJob();
    } catch (error) { setMessage(error instanceof Error ? error.message : t("cancel.failed")); }
    finally { setCancelling(false); }
  };

  const chooseSource = async () => {
    try {
      const selected = await recut.media.pick([sourceKind]) as MediaAsset | null;
      if (!selected) return;
      setAssets((items) => items.some((asset) => asset.id === selected.id) ? items : [selected, ...items]);
      setSelectedAsset(selected); setAssetId(selected.id); setMessage(t(sourceKind === "image" ? "pick.picked.image" : "pick.picked.video", { name: selected.name }));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("pick.failed")); }
  };

  const save = async (output: DepthOutput) => {
    setBusy("save");
    try { const result = await recut.background.call("depth.save", { id: output.id }) as { assetId: string }; setOutputs((items) => items.map((item) => item.id === output.id ? { ...item, savedAssetId: result.assetId } : item)); setMessage(t("save.done")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("save.failed")); }
    finally { setBusy(null); }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith(`${sourceKind}/`)) return setMessage(t(sourceKind === "image" ? "upload.type.image" : "upload.type.video"));
    setBusy("upload");
    try {
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/v1/media/assets", { method: "POST", body: form });
      const payload = await response.json().catch(() => ({})) as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || t("upload.failed"));
      const nextAssets = await loadAssets(); const selected = nextAssets.find((asset) => asset.id === payload.id) ?? { id: payload.id, name: file.name, kind: sourceKind, mimeType: file.type, status: "completed" };
      setSelectedAsset(selected); setAssetId(payload.id); setMessage(t("upload.added"));
    } catch (error) { setMessage(error instanceof Error ? error.message : t("upload.failed")); }
    finally { setBusy(null); }
  };

  const askAgent = async () => {
    setBusy("agent");
    try { await recut.agent.compose(t("agent.prompt", { detail: status?.error || message })); setMessage(t("agent.filled")); }
    catch (error) { setMessage(error instanceof Error ? error.message : t("agent.failed")); }
    finally { setBusy(null); }
  };

  if (!status?.ready) return <Setup autoPrepare={status !== null} busy={busy} elapsedSeconds={elapsedSeconds} failure={failure || (!status?.pending ? status?.error || "" : "")} logs={logs} message={message} onPrepare={() => void prepare()} onAskAgent={() => void askAgent()} t={t} />;
  return <main className="app-shell"><header className="app-header"><div><p className="eyebrow">{t("header.eyebrow")}</p><h1>{t("header.title")}</h1><p>{t("header.subtitle")}</p></div></header><section className="workspace"><div className="controls"><SectionTitle label={t("controls.section.input")} title={t("controls.input.title")} /><div className="segmented">{(["image", "video"] as SourceKind[]).map((kind) => <button className={sourceKind === kind ? "selected" : ""} disabled={busy !== null} key={kind} onClick={() => { setSourceKind(kind); setAssetId(""); setSelectedAsset(null); }} type="button">{kind === "image" ? <Image size={15} /> : <Video size={15} />}{t(kind === "image" ? "controls.kind.image" : "controls.kind.video")}</button>)}</div><p className="field-label">{t("controls.library")}</p><button className="secondary-button" disabled={busy !== null} onClick={() => void chooseSource()} type="button"><FolderOpen size={15} />{sourceAsset ? t("controls.change") : t(sourceKind === "image" ? "controls.pick.image" : "controls.pick.video")}</button>{sourceAsset && <SelectedSource asset={sourceAsset} t={t} />}<label className="upload-control"><Upload size={15} />{t(sourceKind === "image" ? "controls.upload.image" : "controls.upload.video")}<input disabled={busy !== null} accept={`${sourceKind}/*`} onChange={(event) => void upload(event.target.files?.[0])} type="file" /></label><SectionTitle label={t("controls.section.model")} title={t("controls.model.title")} /><p className="field-label">{t("controls.modelSize")}</p><AppSelect ariaLabel={t("controls.modelSize")} disabled={busy !== null} onChange={setModel} options={models.map((item) => ({ id: item.id, label: item.label, note: t(item.noteKey) }))} value={model} />{readyModel ? <p className="model-ready"><Check size={14} />{t("controls.downloaded")}</p> : <button className="secondary-button" disabled={busy !== null} onClick={() => void install()} type="button"><Download size={15} />{t("controls.downloadModel")}</button>}<SectionTitle label={t("controls.section.output")} title={t("controls.output.title")} /><div className="segmented">{(["color", "grayscale"] as OutputStyle[]).map((item) => <button className={style === item ? "selected" : ""} disabled={busy !== null} key={item} onClick={() => setStyle(item)} type="button">{t(item === "color" ? "controls.style.color" : "controls.style.grayscale")}</button>)}</div><button className="primary-button" disabled={busy !== null || !assetId || !readyModel} onClick={() => void generate()} type="button">{busy === "generate" ? <LoaderCircle className="spin" size={16} /> : <Image size={16} />}{busy === "generate" ? t("controls.generate.running") : t("controls.generate")}</button></div><OutputPanel output={currentOutput} busy={busy} onSave={save} t={t} /></section><BottomPanel activeTab={bottomTab} cancelling={cancelling} elapsedSeconds={elapsedSeconds} logs={logs} outputs={outputs} busy={busy} locale={locale} onCancel={() => void cancel()} onPreview={setPreviewOutput} onSave={save} onTabChange={selectBottomTab} t={t} /><p className="status" role="status">{message}</p>{previewOutput && <PreviewDialog output={previewOutput} onClose={() => setPreviewOutput(null)} t={t} />}</main>;
}

function SelectedSource({ asset, t }: { asset: MediaAsset; t: Translate }) { const source = `/v1/media/assets/${encodeURIComponent(asset.id)}/content`; return <figure className="source-preview"><div>{asset.kind === "image" ? <img alt={t("source.selected.alt", { name: asset.name })} src={source} /> : <video controls preload="metadata" src={source} />}</div><figcaption><strong>{asset.name}</strong><span>{t(asset.kind === "image" ? "controls.kind.image" : "controls.kind.video")} · {t("source.selected")}</span></figcaption></figure>; }

function Setup({ autoPrepare, busy, elapsedSeconds, failure, logs, message, onPrepare, onAskAgent, t }: { autoPrepare: boolean; busy: string | null; elapsedSeconds: number; failure: string; logs: ShellJobLog[]; message: string; onPrepare: () => void; onAskAgent: () => void; t: Translate }) {
  const started = useRef(false);
  useEffect(() => { if (autoPrepare && !started.current) { started.current = true; onPrepare(); } }, [autoPrepare, onPrepare]);
  return <main className="setup"><div className="setup-mark"><LoaderCircle className="spin" size={22} /></div><p className="eyebrow">DEPTH ANYTHING</p><h1>{t("setup.startingTitle")}</h1><p>{t("setup.intro")}</p>{busy === "prepare" && <><JobTimer elapsedSeconds={elapsedSeconds} t={t} /><pre className="job-log" aria-label={t("setup.ariaLog")}>{logs.length ? logText(logs) : t("setup.startingEnv")}</pre></>}{failure && <div className="error-box"><strong>{t("setup.failedTitle")}</strong><pre>{failure}</pre><button className="link-button" disabled={busy !== null} onClick={onAskAgent} type="button"><Send size={14} />{t("setup.askAgent")}</button></div>}<button className="secondary-button" disabled={busy !== null} onClick={onPrepare} type="button">{busy === "prepare" ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}{busy === "prepare" ? t("setup.startingButton") : t("setup.retry")}</button><p className="status" role="status">{message}</p></main>;
}

function OutputPanel({ output, busy, onSave, t }: { output?: DepthOutput; busy: string | null; onSave: (output: DepthOutput) => void; t: Translate }) {
  return <section className="output-panel"><header><SectionTitle label={t("output.section.preview")} title={t("output.title")} />{output && <span className={output.savedAssetId ? "saved-pill" : "private-pill"}>{output.savedAssetId ? t("output.savedPill") : t("output.privatePill")}</span>}</header><div className="preview">{output ? output.kind === "image" ? <img alt={t("output.alt")} src={output.previewURL} /> : <video controls src={output.previewURL} /> : <div className="empty"><Image size={28} /><p>{t("output.empty")}</p></div>}</div>{output && <footer><div><strong>{modelLabel(output.model)} · {t(output.style === "color" ? "output.style.color" : "output.style.grayscale")}</strong><span>{t("output.hint")}</span></div>{output.savedAssetId ? <span className="saved-copy"><Check size={15} />{t("output.saved")}</span> : <button className="primary-button compact" disabled={busy !== null} onClick={() => onSave(output)} type="button">{busy === "save" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{t("output.save")}</button>}</footer>}</section>;
}

function BottomPanel({ activeTab, cancelling, elapsedSeconds, logs, outputs, busy, locale, onCancel, onPreview, onSave, onTabChange, t }: { activeTab: "history" | "logs"; cancelling: boolean; elapsedSeconds: number; logs: ShellJobLog[]; outputs: DepthOutput[]; busy: string | null; locale: Locale; onCancel: () => void; onPreview: (output: DepthOutput) => void; onSave: (output: DepthOutput) => void; onTabChange: (tab: "history" | "logs") => void; t: Translate }) { const running = busy === "prepare" || busy === "install" || busy === "generate"; return <section className="bottom-panel"><div className="bottom-tabs" role="tablist" aria-label={t("bottom.aria")}><button aria-controls="depth-history" aria-selected={activeTab === "history"} id="depth-history-tab" onClick={() => onTabChange("history")} role="tab" type="button">{t("bottom.history")} <span>{outputs.length}</span></button><button aria-controls="depth-logs" aria-selected={activeTab === "logs"} id="depth-logs-tab" onClick={() => onTabChange("logs")} role="tab" type="button">{t("bottom.logs")} <span>{logs.length}</span></button>{running && <button className="cancel-job" disabled={cancelling} onClick={onCancel} type="button"><CircleStop size={14} />{cancelling ? t("bottom.cancel.running") : t("bottom.cancel")}</button>}</div><div className="bottom-panel-content">{activeTab === "history" ? <History outputs={outputs} busy={busy} locale={locale} onPreview={onPreview} onSave={onSave} t={t} /> : <div aria-labelledby="depth-logs-tab" id="depth-logs" role="tabpanel">{running && <JobTimer elapsedSeconds={elapsedSeconds} t={t} />}<pre className="job-log">{logs.length ? logText(logs) : t("bottom.logs.empty")}</pre></div>}</div></section>; }

function History({ outputs, busy, locale, onPreview, onSave, t }: { outputs: DepthOutput[]; busy: string | null; locale: Locale; onPreview: (output: DepthOutput) => void; onSave: (output: DepthOutput) => void; t: Translate }) { return <div aria-labelledby="depth-history-tab" id="depth-history" role="tabpanel"><header className="history-header"><SectionTitle label={t("history.section.history")} title={t("history.title")} /><span>{t("history.count", { count: String(outputs.length) })}</span></header>{outputs.length ? <div className="history-grid">{outputs.map((output) => <article className="history-card" key={output.id} onClick={() => onPreview(output)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPreview(output); } }} role="button" tabIndex={0}><div className="thumb">{output.kind === "image" ? <img alt={t("history.alt")} src={output.previewURL} /> : <video muted preload="metadata" src={output.previewURL} />}</div><div><strong>{modelLabel(output.model)} · {t(output.kind === "image" ? "history.kind.image" : "history.kind.video")}</strong><span>{formatDate(locale, output.createdAt)}</span>{output.savedAssetId ? <em>{t("history.saved")}</em> : <button className="text-button" disabled={busy !== null} onClick={(event) => { event.stopPropagation(); onSave(output); }} type="button"><Save size={13} />{t("history.save")}</button>}</div></article>)}</div> : <p className="empty-history">{t("history.empty")}</p>}</div>; }

function JobTimer({ elapsedSeconds, t }: { elapsedSeconds: number; t: Translate }) { return <p className="job-timer"><Clock3 size={14} />{t("jobtimer.running", { elapsed: formatElapsed(elapsedSeconds) })}</p>; }

function PreviewDialog({ output, onClose, t }: { output: DepthOutput; onClose: () => void; t: Translate }) { return <div className="preview-dialog-backdrop" onMouseDown={onClose} role="presentation"><section aria-label={t("preview.aria")} aria-modal="true" className="preview-dialog" onMouseDown={(event) => event.stopPropagation()} role="dialog"><header><div><p className="eyebrow">DEPTH OUTPUT</p><h2>{modelLabel(output.model)} · {t(output.kind === "image" ? "history.kind.image" : "history.kind.video")}</h2></div><button aria-label={t("preview.close")} className="icon-button" onClick={onClose} type="button"><X size={16} /></button></header><div className="preview-dialog-media">{output.kind === "image" ? <img alt={t("preview.alt")} src={output.previewURL} /> : <video autoPlay controls playsInline src={output.previewURL} />}</div></section></div>; }

function AppSelect<T extends string>({ ariaLabel, disabled, onChange, options, value }: { ariaLabel: string; disabled?: boolean; onChange: (value: T) => void; options: { id: T; label: string; note: string }[]; value: T }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value) ?? options[0];
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    if (open) document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [open]);
  return <div className="app-select" ref={root}><button aria-expanded={open} aria-haspopup="listbox" aria-label={ariaLabel} className="app-select-trigger" disabled={disabled} onClick={() => setOpen((visible) => !visible)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} type="button"><span><strong>{selected.label}</strong><small>{selected.note}</small></span><ChevronDown className={open ? "rotate" : ""} size={16} /></button>{open && <div aria-label={ariaLabel} className="app-select-menu" role="listbox">{options.map((option) => <button aria-selected={option.id === value} key={option.id} onClick={() => { onChange(option.id); setOpen(false); }} role="option" type="button"><span><strong>{option.label}</strong><small>{option.note}</small></span>{option.id === value && <Check size={15} />}</button>)}</div>}</div>;
}

function SectionTitle({ label, title }: { label: string; title: string }) { return <div className="section-title"><span>{label}</span><h2>{title}</h2></div>; }

createRoot(document.getElementById("root")!).render(<App />);
