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
  };

  const bankingLabel = document.createElement("label");
  bankingLabel.innerHTML =
    "<br>Items will get locked to keep at least X second of cookies in bank.<br>Maximum [Lucky!] payout requires 6000 CpS<br>Maximum [Lucky!] payout with [Get Lucky] upgrade requires 42000 CpS<br>Maximum [Cookie chain] payout requires 43200 CpS<br>Maximum [Cookie chain] payout with [Get Lucky] upgrade requires 302400 CpS";

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
    };

    const colorPickerLabel = document.createElement("label");
    colorPickerLabel.innerHTML = picker.label;

    colorPickerDiv.appendChild(colorPicker);
    colorPickerDiv.appendChild(colorPickerLabel);
    colorPickerDiv.appendChild(document.createElement("br"));
  });
  return colorPickerDiv;
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
  body.appendChild(document.createElement("br"));
  body.appendChild(this.colorPickerDiv());
  ensureCCSE().AppendCollapsibleOptionsMenu(this.displayname, body);
}
