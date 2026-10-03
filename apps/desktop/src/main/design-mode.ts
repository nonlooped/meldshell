import { ipcMain, type WebContents } from "electron"
import { IPC, type PickedElement } from "@meldshell/contracts/ipc"
import { previewGuest } from "./preview"

/*
 * Design mode lets the user click an element in a thread's preview and hand it to the agent. The
 * picker runs in its own isolated world, so the page's scripts cannot see it or forge a pick, and
 * draws its outline inside a closed shadow root that page styles cannot reach. Page scripts are
 * plain strings: bundling would rename helpers inside functions serialized with `toString`.
 */

/** The isolated world the picker runs in; Electron reserves the low ids. */
const WORLD = 1717
const SCREENSHOT_WIDTH = 1600
const FALLBACK_ACCENT = "#4c8dff"

/** Computed styles worth describing, each skipped while it holds one of its usual defaults. */
const STYLE_PROPERTIES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "box-sizing",
  "width",
  "height",
  "margin",
  "padding",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "color",
  "background-color",
  "background-image",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration-line",
  "border",
  "border-radius",
  "outline",
  "box-shadow",
  "opacity",
  "transform",
  "overflow",
  "transition",
]

const pickScript = (accent: string): string => `(() => {
  const accent = ${JSON.stringify(accent)};
  const properties = ${JSON.stringify(STYLE_PROPERTIES)};
  window.__meldshellDesign?.finish(null);
  return new Promise((resolve) => {
    const host = document.createElement("meldshell-design-mode");
    host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;";
    host.style.setProperty("--accent", accent);
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML =
      "<style>" +
      ".box{position:fixed;display:none;box-sizing:border-box;border:2px solid var(--accent);border-radius:3px;" +
      "background:color-mix(in srgb,var(--accent) 12%,transparent);transition:all 70ms ease-out}" +
      ".tag{position:fixed;display:none;max-width:min(420px,80vw);padding:2px 7px;border-radius:4px;" +
      "background:var(--accent);color:#fff;font:600 11px/17px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,.25)}" +
      ".tag span{font-weight:400;opacity:.85;margin-left:6px}" +
      "</style><div class=box></div><div class=tag></div>";
    const box = root.querySelector(".box");
    const tag = root.querySelector(".tag");
    const cursor = document.createElement("style");
    cursor.textContent = "*,*::before,*::after{cursor:crosshair!important}";
    document.documentElement.append(host);
    (document.head ?? document.documentElement).append(cursor);
    let current = null;

    const label = (element) => {
      let text = element.localName;
      if (element.id) return text + "#" + element.id;
      for (const name of Array.from(element.classList).slice(0, 2)) text += "." + name;
      return text;
    };
    const selector = (element) => {
      const parts = [];
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) {
          parts.unshift("#" + CSS.escape(node.id));
          break;
        }
        let part = node.localName;
        const parent = node.parentElement;
        if (parent) {
          const same = Array.from(parent.children).filter((child) => child.localName === node.localName);
          if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
        }
        parts.unshift(part);
        if (node.localName === "body" || node.localName === "html") break;
      }
      return parts.join(" > ");
    };
    const usual = (property, value, styles) => {
      if (["none", "normal", "auto", "0px", "rgba(0, 0, 0, 0)", "static", "visible", "start", ""].includes(value)) return true;
      if (["top", "right", "bottom", "left", "z-index"].includes(property)) return styles.position === "static";
      if (["flex-direction", "flex-wrap", "justify-content", "align-items"].includes(property))
        return !styles.display.includes("flex");
      if (property.startsWith("grid-")) return !styles.display.includes("grid");
      if (property === "gap") return !/flex|grid/.test(styles.display);
      if (property === "border" || property === "outline") return /^0px|none/.test(value) || value.includes(" none ");
      if (property === "opacity") return value === "1";
      if (property === "box-sizing") return value === "content-box";
      if (property === "transition") return /^all 0s ease 0s$/.test(value);
      if (property === "margin" || property === "padding") return /^(0px ?)+$/.test(value);
      return false;
    };
    const describe = (element) => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      let html = element.outerHTML.replace(/\\n\\s*\\n/g, "\\n");
      if (html.length > 4000) html = html.slice(0, 4000) + "\\n<!-- … shortened -->";
      let text = (element.innerText ?? element.textContent ?? "").replace(/\\s+/g, " ").trim();
      if (text.length > 240) text = text.slice(0, 239) + "…";
      const pad = 6;
      const x = Math.max(0, rect.left - pad);
      const y = Math.max(0, rect.top - pad);
      return {
        url: location.href,
        label: label(element),
        selector: selector(element),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        html,
        text,
        styles: properties
          .map((property) => [property, styles.getPropertyValue(property).trim()])
          .filter(([property, value]) => !usual(property, value, styles)),
        clip: {
          x,
          y,
          width: Math.min(innerWidth, rect.right + pad) - x,
          height: Math.min(innerHeight, rect.bottom + pad) - y,
        },
      };
    };
    const show = (element) => {
      current = element;
      if (!element) {
        box.style.display = tag.style.display = "none";
        return;
      }
      const rect = element.getBoundingClientRect();
      Object.assign(box.style, {
        display: "block",
        left: rect.left + "px",
        top: rect.top + "px",
        width: rect.width + "px",
        height: rect.height + "px",
      });
      tag.textContent = label(element);
      const size = document.createElement("span");
      size.textContent = Math.round(rect.width) + " × " + Math.round(rect.height);
      tag.append(size);
      tag.style.display = "block";
      const above = rect.top - 23;
      tag.style.top = (above >= 2 ? above : Math.min(rect.bottom + 4, innerHeight - 21)) + "px";
      tag.style.left = Math.max(2, Math.min(rect.left, innerWidth - tag.offsetWidth - 2)) + "px";
    };
    const target = (event) => {
      const element = event.composedPath().find((node) => node instanceof Element);
      return element && element !== host ? element : null;
    };
    const swallow = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onMove = (event) => {
      const element = target(event);
      if (element !== current) show(element);
    };
    const onClick = (event) => {
      swallow(event);
      if (event.button !== 0) return;
      const element = target(event) ?? current;
      if (!element) return;
      const more = event.shiftKey;
      finish(undefined);
      const picked = describe(element);
      // Two frames let the page repaint without the outline before it is captured.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ ...picked, more })));
    };
    const onContextMenu = (event) => {
      swallow(event);
      finish(null);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      swallow(event);
      finish(null);
    };
    const onScroll = () => show(current);
    const blocked = ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "auxclick"];
    const finish = (result) => {
      removeEventListener("pointermove", onMove, true);
      removeEventListener("click", onClick, true);
      removeEventListener("contextmenu", onContextMenu, true);
      removeEventListener("keydown", onKey, true);
      removeEventListener("scroll", onScroll, true);
      removeEventListener("resize", onScroll, true);
      for (const name of blocked) removeEventListener(name, swallow, true);
      host.remove();
      cursor.remove();
      if (window.__meldshellDesign === state) delete window.__meldshellDesign;
      if (result !== undefined) resolve(result);
    };
    const state = { finish };
    window.__meldshellDesign = state;
    addEventListener("pointermove", onMove, true);
    addEventListener("click", onClick, true);
    addEventListener("contextmenu", onContextMenu, true);
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", onScroll, true);
    addEventListener("resize", onScroll, true);
    for (const name of blocked) addEventListener(name, swallow, true);
  });
})()`

const cancelScript = "window.__meldshellDesign?.finish(null)"

interface Clip {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type PageResult = Omit<PickedElement, "screenshot"> & { readonly clip: Clip }

/** Resolves with null once the page leaves for another document or goes away. */
const interrupted = (page: WebContents): { promise: Promise<null>; dispose: () => void } => {
  let resolve: (value: null) => void = () => undefined
  const promise = new Promise<null>((done) => {
    resolve = done
  })
  const onNavigate = (
    details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
  ) => {
    if (details.isMainFrame && !details.isSameDocument) resolve(null)
  }
  const onGone = () => resolve(null)
  page.on("did-start-navigation", onNavigate)
  page.once("destroyed", onGone)
  page.once("render-process-gone", onGone)
  return {
    promise,
    dispose: () => {
      page.off("did-start-navigation", onNavigate)
      page.off("destroyed", onGone)
      page.off("render-process-gone", onGone)
    },
  }
}

/** The page's pixels around the element, at most a readable width. */
const capture = async (page: WebContents, clip: Clip): Promise<string | null> => {
  const zoom = page.getZoomFactor()
  const rect = {
    x: Math.floor(clip.x * zoom),
    y: Math.floor(clip.y * zoom),
    width: Math.ceil(clip.width * zoom),
    height: Math.ceil(clip.height * zoom),
  }
  if (rect.width < 1 || rect.height < 1) return null
  let image = await page.capturePage(rect)
  if (image.isEmpty()) return null
  if (image.getSize().width > SCREENSHOT_WIDTH)
    image = image.resize({ width: SCREENSHOT_WIDTH, quality: "good" })
  return image.toDataURL()
}

const accentColor = (value: unknown): string =>
  typeof value === "string" && /^[#a-z0-9(),.%\s-]{1,64}$/i.test(value.trim())
    ? value.trim()
    : FALLBACK_ACCENT

const pick = async (page: WebContents, accent: string): Promise<PickedElement | null> => {
  const stop = interrupted(page)
  try {
    const result = (await Promise.race([
      page.executeJavaScriptInIsolatedWorld(WORLD, [{ code: pickScript(accent) }], true),
      stop.promise,
    ])) as PageResult | null
    if (result === null || page.isDestroyed()) return null
    const { clip, ...element } = result
    const screenshot = await capture(page, clip).catch(() => null)
    return { ...element, screenshot }
  } finally {
    stop.dispose()
  }
}

export function registerDesignModeIpc(): void {
  ipcMain.handle(IPC.designModePick, (event, id: unknown, accent: unknown) => {
    const page = previewGuest(event.sender, id)
    return page === null ? null : pick(page, accentColor(accent))
  })
  ipcMain.on(IPC.designModeCancel, (event, id: unknown) => {
    const page = previewGuest(event.sender, id)
    if (page !== null)
      // A page that already went away has nothing left to cancel.
      void page.executeJavaScriptInIsolatedWorld(WORLD, [{ code: cancelScript }]).catch(() => null)
  })
}
