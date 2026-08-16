/**
 * [INPUT]: 依赖宿主注入的 MessageChannel、独立 App workspace scope 与 iframe URL 的 locale 参数
 * [OUTPUT]: 对外提供 App operation、平台素材选择、右侧 Agent 输入回填（compose，仅填输入框绝不自动提交）、当前 locale 查询与 React locale hook 的 iframe SDK
 * [POS]: ui/src 的宿主通信边界；组件不直接读写 App SQLite 或执行本机命令，Agent 内容必须经全局 chat 可见
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useSyncExternalStore } from "react";
import { translate } from "./i18n";
import type { Locale } from "./i18n";
type RequestType = "state.query" | "background.call" | "agent.compose" | "media.pick";
let port: MessagePort | null = null;
let sequence = 0;
const pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void }>();

function resolveRecutLocale(): Locale {
  const fromQuery = new URLSearchParams(window.location.search).get("locale");
  if (fromQuery === "zh" || fromQuery === "en") return fromQuery;
  return String(navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function getRecutLocale(): Locale {
  return resolveRecutLocale();
}

const localeListeners = new Set<() => void>();
function subscribeLocale(listener: () => void) {
  localeListeners.add(listener);
  return () => { localeListeners.delete(listener); };
}

export function useRecutLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getRecutLocale);
}

function call(type: RequestType, input: Record<string, unknown>) {
  return new Promise<any>((resolve, reject) => {
    if (!port) return reject(new Error(translate(getRecutLocale(), "sdk.hostNotConnected")));
    const id = `depth-${Date.now().toString(36)}-${++sequence}`;
    pending.set(id, { resolve, reject });
    port.postMessage({ id, type, input });
  });
}

window.addEventListener("message", (event) => {
	if (event.data?.type === "recut.project.event") {
		window.dispatchEvent(new CustomEvent("recut-project-event", { detail: event.data.event }));
		return;
	}
  if (event.data?.type !== "recut.ui.connect" || !event.ports[0]) return;
  port = event.ports[0];
  port.onmessage = (message) => {
    const request = pending.get(message.data?.id);
    if (!request) return;
    pending.delete(message.data.id);
    message.data.error ? request.reject(new Error(message.data.error)) : request.resolve(message.data.result);
  };
  port.start();
  window.dispatchEvent(new Event("recut-sdk-ready"));
});

export const recut = {
  state: { query: (name: string) => call("state.query", { name }) },
  background: { call: (name: string, input: Record<string, unknown> = {}) => call("background.call", { name, ...input }) },
  agent: { compose: (prompt: string) => call("agent.compose", { prompt }) },
  media: { pick: (kinds: string[]) => call("media.pick", { kinds }) },
  events: { subscribe: (listener: (event: unknown) => void) => { const handler = (event: Event) => listener((event as CustomEvent).detail); window.addEventListener("recut-project-event", handler); return () => window.removeEventListener("recut-project-event", handler); } },
};
