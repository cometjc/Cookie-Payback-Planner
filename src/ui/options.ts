import type { CookiePaybackPlanner } from "../core/predictor";
import { Game, ensureCCSE, l, PlaySound } from "../core/globals";

export function getButtonID(this: CookiePaybackPlanner, config: string) {
  return `CookieProfitPredictor_${config}`;
}

export function toggleButton(this: CookiePaybackPlanner, config: string, text: string) {
  const name = this.getButtonID(config);
  const button = document.createElement("a");
  button.id = name;
  button.classList.add("smallFancyButton", "prefButton", "option");
  this.updateButtonState(config, text, button);
  button.addEventListener("click", () => {
    (this.config as any)[config] = !(this.config as any)[config];
    this.markConfigDirty();
    PlaySound("snd/tick.mp3");
    this.updateButtonState(config, text, button);
  });
  return button;
}

export function updateButtonState(this: CookiePaybackPlanner, config: string, text: string, button: HTMLElement) {
  const value = (this.config as any)[config];
  button.classList.toggle("off", !value);
  button.textContent = `${text} ${value ? "On" : "Off"}`;
  const sort_dependent_configs = ["sortGrandmapocalypse", "sortWizardTower"];
  if (config === "enableSort") {
    sort_dependent_configs.forEach((buttonId) => {
      const toggleButton = l(this.getButtonID(buttonId));
      if (toggleButton) {
        toggleButton.style.opacity = (this.config as any)[buttonId] && this.config.enableSort ? "1" : "0.5";
      }
    });
  }
  if (sort_dependent_configs.includes(config)) {
    button.style.opacity = value && this.config.enableSort ? "1" : "0.5";
  }
}

export function sortingDiv(this: CookiePaybackPlanner) {
  const sortingDiv = document.createElement("div");

  const wizardTowerName = Game.Objects["Wizard tower"]?.dname || "Wizard tower";
  const toggleButtons = [
    { config: "enableSort", text: "Sort by payback rate" },
    { config: "sortGrandmapocalypse", text: "Grandmapocalypse" },
    { config: "sortWizardTower", text: wizardTowerName },
  ];

  toggleButtons.forEach((button) => {
    sortingDiv.appendChild(this.toggleButton(button.config, button.text));
  });

  return sortingDiv;
}

export function autoBuyDiv(this: CookiePaybackPlanner) {
  const autoBuyDiv = document.createElement("div");
  autoBuyDiv.appendChild(this.toggleButton("autoBuy", "Auto buy best deal"));
  autoBuyDiv.appendChild(this.toggleButton("enablePerfProfiler", "Enable perf profiler logs"));
  const button = document.createElement("button");
  button.id = this.getButtonID("experimentalBatch");
  button.type = "button";
  button.classList.add("smallFancyButton", "prefButton", "option");
  button.textContent = "Experimental bulk100 acceleration";
  const hint = document.createElement("p");
  hint.id = this.getButtonID("experimentalBatchHint");
  hint.textContent = "Off by default. Game 2.053 only. One building is checked per update; unchecked buildings or checks older than 10 seconds use native calculations. Recommendations may differ between checks; any detected mismatch disables acceleration. Bank reserve checks remain native.";
  button.setAttribute("aria-describedby", hint.id);
  const update = () => {
    button.setAttribute("aria-pressed", String(this.config.experimentalBatch));
    button.classList.toggle("off", !this.config.experimentalBatch);
  };
  update();
  button.addEventListener("click", () => {
    this.config.experimentalBatch = !this.config.experimentalBatch;
    this.markConfigDirty();
    update();
  });
  autoBuyDiv.append(button, hint);
  return autoBuyDiv;
}

export function bankingDiv(this: CookiePaybackPlanner) {
  const bankingSecondsInput = document.createElement("input");
  bankingSecondsInput.type = "number";
  bankingSecondsInput.min = "0";
  bankingSecondsInput.style.width = "6em";
  bankingSecondsInput.id = "CookieProfitPredictorBankingSecondsInput";
  bankingSecondsInput.value = String(Number(this.config.bankingSeconds));
  bankingSecondsInput.onchange = bankingSecondsInput.onpaste = bankingSecondsInput.oninput = () => {
    bankingSecondsInput.value = bankingSecondsInput.value.replace(/[^0-9]/g, "");
    this.config.bankingSeconds = Number(bankingSecondsInput.value);
    this.markConfigDirty();
  };

  const bankingLabel = document.createElement("label");
  bankingLabel.innerHTML =
    "<br>Items will get locked to keep at least X second of cookies in bank.<br>Maximum [Lucky!] payout requires 6000 CpS<br>Maximum [Lucky!] payout during Frenzy (7x, usually enabled by [Get Lucky]) requires 42000 CpS<br>Maximum [Cookie chain] payout requires 43200 CpS<br>Maximum [Cookie chain] payout during Frenzy (7x, usually enabled by [Get Lucky]) requires 302400 CpS";

  const bankingDiv = document.createElement("div");
  bankingDiv.appendChild(this.toggleButton("isBanking", "Banking cookies"));
  bankingDiv.appendChild(bankingSecondsInput);
  bankingDiv.appendChild(bankingLabel);
  return bankingDiv;
}

export function intervalBoxDiv(this: CookiePaybackPlanner) {
  const updateTimeLabel = document.createElement("div");
  updateTimeLabel.style.float = "left";
  updateTimeLabel.innerHTML = "UI Update Interval";

  const updateTimeValue = document.createElement("div");
  updateTimeValue.style.float = "right";
  updateTimeValue.id = "CookieProfitPredictor_UpdateMSValue";
  updateTimeValue.innerHTML = this.config.updateMS + "ms";

  const updateTimeSlider = document.createElement("input");
  updateTimeSlider.classList.add("slider");
  updateTimeSlider.id = "CookieProfitPredictor_UpdateMSSlider";
  updateTimeSlider.style.clear = "both";
  updateTimeSlider.type = "range";
  updateTimeSlider.min = "500";
  updateTimeSlider.max = "10000";
  updateTimeSlider.step = "100";
  updateTimeSlider.value = String(this.config.updateMS);
  updateTimeSlider.onchange = updateTimeSlider.oninput = () => {
    PlaySound("snd/tick.mp3");
    this.config.updateMS = Number(updateTimeSlider.value);
    this.markConfigDirty();
    l("CookieProfitPredictor_UpdateMSValue").innerHTML = this.config.updateMS + "ms";
  };

  const intervalBoxDiv = document.createElement("div");
  intervalBoxDiv.classList.add("sliderBox");
  intervalBoxDiv.appendChild(updateTimeLabel);
  intervalBoxDiv.appendChild(updateTimeValue);
  intervalBoxDiv.appendChild(updateTimeSlider);
  return intervalBoxDiv;
}

export function colorPickerDiv(this: CookiePaybackPlanner) {
  const colorPickerDiv = document.createElement("div");
  const colorPickers = [
    { config: "color0", label: "(best payback rate color)" },
    { config: "color1", label: "(2nd payback rate color)" },
    { config: "color7", label: "(8th payback rate color)" },
    { config: "color15", label: "(16th payback rate color)" },
    { config: "colorLast", label: "(worst payback rate color)" },
  ];

  colorPickers.forEach((picker) => {
    const colorPicker = document.createElement("input");
    colorPicker.type = "color";
    colorPicker.id = `CookieProfitPredictor${picker.config}Picker`;
    colorPicker.value = (this.config as any)[picker.config];
    colorPicker.onchange = () => {
      (this.config as any)[picker.config] = colorPicker.value;
      this.markConfigDirty();
    };

    const colorPickerLabel = document.createElement("label");
    colorPickerLabel.innerHTML = picker.label;

    colorPickerDiv.appendChild(colorPicker);
    colorPickerDiv.appendChild(colorPickerLabel);
    colorPickerDiv.appendChild(document.createElement("br"));
  });
  return colorPickerDiv;
}

function strategyDiv(this: CookiePaybackPlanner) {
  const container = document.createElement("div");
  const title = document.createElement("label");
  title.textContent = "Strategy engine";
  container.appendChild(title);
  container.appendChild(document.createElement("br"));

  const algorithmLabel = document.createElement("label");
  algorithmLabel.textContent = "  Algorithm (experimental A*)";
  const algorithmSelect = document.createElement("select");
  algorithmSelect.style.width = "9.6em";
  const algorithmOptions: Array<{ value: "beam" | "astar"; text: string }> = [
    { value: "beam", text: "Beam (default)" },
    { value: "astar", text: "A* (experimental)" },
  ];
  for (const option of algorithmOptions) {
    const el = document.createElement("option");
    el.value = option.value;
    el.textContent = option.text;
    algorithmSelect.appendChild(el);
  }
  algorithmSelect.value = this.config.strategyAlgorithm;
  algorithmSelect.onchange = () => {
    this.config.strategyAlgorithm = algorithmSelect.value === "astar" ? "astar" : "beam";
    this.markConfigDirty();
  };
  container.appendChild(algorithmLabel);
  container.appendChild(algorithmSelect);

  const numberField = (labelText: string, value: number, onChange: (nextValue: number) => void) => {
    container.appendChild(document.createElement("br"));
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.style.width = "5em";
    input.value = String(value);
    input.onchange = input.oninput = () => {
      const numeric = Number(input.value);
      if (Number.isFinite(numeric)) {
        onChange(numeric);
        this.markConfigDirty();
      }
    };
    container.appendChild(label);
    container.appendChild(input);
  };

  numberField("  Top-K", this.config.lookaheadTopK, (nextValue) => {
    this.config.lookaheadTopK = Math.max(2, Math.min(20, Math.floor(nextValue)));
  });
  numberField("  Beam width", this.config.beamWidth, (nextValue) => {
    this.config.beamWidth = Math.max(2, Math.min(20, Math.floor(nextValue)));
  });
  numberField("  Beam depth", this.config.beamDepth, (nextValue) => {
    this.config.beamDepth = Math.max(2, Math.min(4, Math.floor(nextValue)));
  });
  numberField("  A* max expand nodes", this.config.strategyAStarMaxExpand, (nextValue) => {
    this.config.strategyAStarMaxExpand = Math.max(20, Math.min(1500, Math.floor(nextValue)));
  });
  numberField("  A* open set limit", this.config.strategyAStarOpenLimit, (nextValue) => {
    this.config.strategyAStarOpenLimit = Math.max(20, Math.min(3000, Math.floor(nextValue)));
  });
  numberField("  A* heuristic weight", this.config.strategyAStarHeuristicWeight, (nextValue) => {
    this.config.strategyAStarHeuristicWeight = Math.max(0, Math.min(2, nextValue));
  });
  numberField("  A* incremental budget ms", this.config.strategyAStarIncrementalBudgetMs, (nextValue) => {
    this.config.strategyAStarIncrementalBudgetMs = Math.max(0.2, Math.min(8, nextValue));
  });
  numberField("  A* max incremental streak", this.config.strategyAStarMaxIncrementalStreak, (nextValue) => {
    this.config.strategyAStarMaxIncrementalStreak = Math.max(1, Math.min(20, Math.floor(nextValue)));
  });
  numberField("  Strategy budget ms", this.config.strategyBudgetMs, (nextValue) => {
    this.config.strategyBudgetMs = Math.max(0.5, Math.min(12, nextValue));
  });
  numberField("  Incremental strategy budget ms", this.config.strategyIncrementalBudgetMs, (nextValue) => {
    this.config.strategyIncrementalBudgetMs = Math.max(0.3, Math.min(8, nextValue));
  });
  numberField("  Strategy smoothing (0-1)", this.config.strategySmoothing, (nextValue) => {
    this.config.strategySmoothing = Math.max(0, Math.min(0.95, nextValue));
  });
  numberField("  Strategy recompute ms", this.config.strategyRecomputeMs, (nextValue) => {
    this.config.strategyRecomputeMs = Math.max(100, Math.min(3000, Math.floor(nextValue)));
  });
  numberField("  Full strategy refresh ms", this.config.strategyFullRefreshMs, (nextValue) => {
    this.config.strategyFullRefreshMs = Math.max(300, Math.min(5000, Math.floor(nextValue)));
  });
  numberField("  Max incremental streak", this.config.strategyMaxIncrementalStreak, (nextValue) => {
    this.config.strategyMaxIncrementalStreak = Math.max(1, Math.min(20, Math.floor(nextValue)));
  });
  numberField("  Horizon min sec", this.config.strategyHorizonMinSec, (nextValue) => {
    this.config.strategyHorizonMinSec = Math.max(5, Math.min(600, Math.floor(nextValue)));
  });
  numberField("  Horizon max sec", this.config.strategyHorizonMaxSec, (nextValue) => {
    this.config.strategyHorizonMaxSec = Math.max(this.config.strategyHorizonMinSec, Math.min(86400, Math.floor(nextValue)));
  });
  numberField("  Horizon scale", this.config.strategyHorizonScale, (nextValue) => {
    this.config.strategyHorizonScale = Math.max(1, Math.min(40, nextValue));
  });
  numberField("  Horizon long weight (0-1)", this.config.strategyHorizonLongWeight, (nextValue) => {
    this.config.strategyHorizonLongWeight = Math.max(0, Math.min(1, nextValue));
  });
  return container;
}

export function addOptionsMenu(this: CookiePaybackPlanner) {
  const body = document.createElement("div");
  body.classList.add("listing");
  body.appendChild(this.sortingDiv());
  body.appendChild(document.createElement("br"));
  body.appendChild(this.autoBuyDiv());
  body.appendChild(document.createElement("br"));
  body.appendChild(this.bankingDiv());
  body.appendChild(document.createElement("br"));
  body.appendChild(this.intervalBoxDiv());
  body.appendChild(document.createElement("br"));
  body.appendChild(strategyDiv.call(this));
  body.appendChild(document.createElement("br"));
  body.appendChild(document.createElement("br"));
  body.appendChild(this.colorPickerDiv());
  ensureCCSE().AppendCollapsibleOptionsMenu(this.displayname, body);
}
