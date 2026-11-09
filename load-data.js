"use strict";

(() => {
  const input = document.querySelector("#data-file");
  const setup = document.querySelector("#data-setup");
  const status = document.querySelector("#data-status");
  const error = document.querySelector("#data-error");
  const text = value => typeof value === "string";
  const timestamp = value => text(value) && /^\d{4}-(0[1-9]|1[0-2])-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value);
  const nullableText = value => value == null || text(value);
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const mapStates = new Set(["stocked", "canceled", "pending"]);
  const slaStates = new Set(["onTime", "late", "openOnTime", "openLate", "canceled", "unmeasurable"]);
  const itemStates = new Set(["stocked", "notFound", "pending"]);

  function isDashboardData(data) {
    const meta = data?.meta;
    return meta?.slaHours === 24 &&
      timestamp(meta.asOf) && timestamp(meta.from) && timestamp(meta.to) &&
      text(meta.location) && text(meta.warehouse) && Array.isArray(meta.sources) && meta.sources.every(text) &&
      count(meta.quality?.orphanItems) && count(meta.quality?.extremeInputQtyRows) &&
      Array.isArray(data.maps) && data.maps.every(map =>
        map && count(map.id) && timestamp(map.created) && (map.finished == null || timestamp(map.finished)) &&
        nullableText(map.operator) && text(map.type) && mapStates.has(map.status) && slaStates.has(map.sla) &&
        (map.hours == null || (Number.isFinite(map.hours) && map.hours >= 0))) &&
      Array.isArray(data.items) && data.items.every(item =>
        item && count(item.mapId) && text(item.sku) && nullableText(item.product) &&
        text(item.categoryId) && text(item.category) && itemStates.has(item.status));
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    status.textContent = "";
    input.value = "";
    input.disabled = false;
  }

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    input.disabled = true;
    error.hidden = true;
    status.textContent = "Abrindo os dados no navegador…";

    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      showError("Não foi possível ler o arquivo. Escolha Dados_SLA_Picking.json.");
      return;
    }
    if (!isDashboardData(data)) {
      showError("Este arquivo não tem o formato do painel. Escolha Dados_SLA_Picking.json.");
      return;
    }

    globalThis.PICKING_DATA = data;
    const script = document.createElement("script");
    script.src = "./app.js";
    script.addEventListener("load", () => {
      const view = document.querySelector("#view");
      if (!view.querySelector(".kpis")) {
        showError("Não foi possível abrir o painel. Recarregue a página e selecione o arquivo novamente.");
        input.disabled = true;
        return;
      }
      setup.hidden = true;
      for (const element of document.querySelectorAll("[data-requires-data]")) element.hidden = false;
      view.focus({ preventScroll: true });
    }, { once: true });
    script.addEventListener("error", () => {
      showError("Não foi possível carregar o painel. Confira se app.js está na mesma pasta que index.html.");
      script.remove();
    }, { once: true });
    document.head.append(script);
  });
})();
