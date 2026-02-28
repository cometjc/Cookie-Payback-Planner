import type { CookiePaybackPlanner } from "./predictor";
import { App, Game } from "./globals";

type DeployManifest = {
  modId?: string;
  modVersion?: string;
  deployedAt?: string;
  buildHash?: string;
};

type HotReloadState = {
  nextTickAt: number;
  savedAt: number;
};

const hotReloadStateKey = "__CPP_HOT_RELOAD_STATE";

const hotReloadScope = globalThis as typeof globalThis & {
  [hotReloadStateKey]?: HotReloadState;
};

function appendCacheBust(url: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}cpp_reload=${Date.now()}`;
}

function toUrl(value: string) {
  if (/^[a-zA-Z]+:\/\//.test(value)) {
    return value;
  }
  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    const normalized = value.replace(/\\/g, "/");
    return `file:///${normalized}`;
  }
  return value.replace(/\\/g, "/");
}

function getKnownScriptUrl(modId: string) {
  const matchPattern = `${modId}/main.js`;
  const scripts = Array.from(document.querySelectorAll("script[src]"));
  const found = scripts
    .map((script) => script.getAttribute("src") || "")
    .filter((src) => src.includes(matchPattern))
    .pop();
  return found || "";
}

function getAppModBaseUrl(modId: string) {
  const mods = App?.mods as Record<string, any> | undefined;
  const mod = mods?.[modId];
  if (!mod || typeof mod !== "object") {
    return "";
  }
  const pathCandidate = mod.dir || mod.path || mod.folder || mod.localDir || mod.src;
  return typeof pathCandidate === "string" ? toUrl(pathCandidate) : "";
}

function getBaseUrl(this: CookiePaybackPlanner) {
  if (this.resolvedMainScriptUrl) {
    return this.resolvedMainScriptUrl.replace(/\/main\.js(?:\?.*)?$/, "");
  }

  const currentScriptUrl = getKnownScriptUrl(this.modId);
  if (currentScriptUrl) {
    this.resolvedMainScriptUrl = currentScriptUrl;
    return currentScriptUrl.replace(/\/main\.js(?:\?.*)?$/, "");
  }

  const appBase = getAppModBaseUrl(this.modId);
  if (appBase) {
    this.resolvedMainScriptUrl = `${appBase}/main.js`;
    return appBase;
  }

  const fallback = `mods/workshop/${this.modId}`;
  this.resolvedMainScriptUrl = `${fallback}/main.js`;
  return fallback;
}

function getManifestUrl(this: CookiePaybackPlanner) {
  if (this.resolvedManifestUrl) {
    return this.resolvedManifestUrl;
  }
  const manifestUrl = `${getBaseUrl.call(this)}/deploy-manifest.json`;
  this.resolvedManifestUrl = manifestUrl;
  return manifestUrl;
}

function getMainScriptUrl(this: CookiePaybackPlanner) {
  if (this.resolvedMainScriptUrl) {
    return this.resolvedMainScriptUrl;
  }
  this.resolvedMainScriptUrl = `${getBaseUrl.call(this)}/main.js`;
  return this.resolvedMainScriptUrl;
}

function getManifestSignature(manifest: DeployManifest) {
  return [manifest.modVersion || "", manifest.buildHash || "", manifest.deployedAt || ""].join("|");
}

async function fetchManifest(url: string): Promise<DeployManifest | null> {
  const response = await fetch(appendCacheBust(url), { cache: "no-store" });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as DeployManifest;
}

function scheduleSelfReloadPoll(this: CookiePaybackPlanner) {
  if (this.isDisposed || this.isReloading) {
    return;
  }
  if (this.selfReloadTimerId) {
    clearTimeout(this.selfReloadTimerId);
  }
  this.selfReloadTimerId = setTimeout(() => {
    void this.checkForDeployUpdate();
  }, this.selfReloadIntervalMs);
}

export function consumeReloadTickDelay() {
  const state = hotReloadScope[hotReloadStateKey];
  if (!state) {
    return null;
  }
  delete hotReloadScope[hotReloadStateKey];
  return Math.max(0, state.nextTickAt - Date.now());
}

export function stopSelfReloadWatcher(this: CookiePaybackPlanner) {
  if (this.selfReloadTimerId) {
    clearTimeout(this.selfReloadTimerId);
    this.selfReloadTimerId = null;
  }
}

export function startSelfReloadWatcher(this: CookiePaybackPlanner) {
  this.stopSelfReloadWatcher();
  void this.checkForDeployUpdate();
}

export async function checkForDeployUpdate(this: CookiePaybackPlanner) {
  if (this.isDisposed || this.isReloading) {
    return;
  }

  try {
    const manifest = await fetchManifest(getManifestUrl.call(this));
    if (manifest) {
      const signature = getManifestSignature(manifest);
      if (signature) {
        if (!this.lastDeploySignature) {
          this.lastDeploySignature = signature;
        } else if (signature !== this.lastDeploySignature) {
          this.lastDeploySignature = signature;
          this.triggerSelfReload(`deploy manifest changed (${manifest.modVersion || "unknown"})`);
          return;
        }
      }
    }
  } catch {
    // Ignore transient file/network errors and try again on next cycle.
  }

  scheduleSelfReloadPoll.call(this);
}

function loadScriptByTag(url: string) {
  const script = document.createElement("script");
  script.src = appendCacheBust(url);
  script.async = true;
  document.head.appendChild(script);
}

function releaseRegisteredModSlot(this: CookiePaybackPlanner) {
  const mods = (Game as any)?.mods as Record<string, any> | undefined;
  if (!mods || typeof mods !== "object") {
    return;
  }
  const current = mods[this.name];
  if (current === this || current?.isDisposed) {
    delete mods[this.name];
  }
}

export function triggerSelfReload(this: CookiePaybackPlanner, _reason?: string) {
  if (this.isReloading) {
    return;
  }

  this.isReloading = true;
  hotReloadScope[hotReloadStateKey] = {
    nextTickAt: this.nextTickAt || Date.now(),
    savedAt: Date.now(),
  };

  this.dispose({ keepReloadState: true });
  releaseRegisteredModSlot.call(this);

  const scriptUrl = getMainScriptUrl.call(this);
  if (typeof Game.LoadMod === "function") {
    Game.LoadMod(appendCacheBust(scriptUrl));
  } else {
    loadScriptByTag(scriptUrl);
  }
}
