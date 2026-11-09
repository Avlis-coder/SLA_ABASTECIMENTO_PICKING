"use strict";

function createProductivityView({ meta, opNames, count, decimal, day, html, table, row, cell, num }) {
  const schedule = { weekday: 8, saturday: 4, daysOff: new Set(["2026-09-07", "2026-10-12", "2026-11-02"]) };
  const maxDailyHours = 8;
  const maxWeeklyHours = 44;
  const baseStart = meta.from.slice(0, 10);
  const baseEnd = meta.asOf.slice(0, 10);
  const formatHours = hours => decimal.format(hours);
  const rate = (quantity, hours) => hours ? decimal.format(quantity / hours) : "—";

  function coveredDays(month) {
    let start = baseStart;
    let end = baseEnd;
    if (month) {
      const [year, monthNumber] = month.split("-").map(Number);
      const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
      start = start > `${month}-01` ? start : `${month}-01`;
      end = end < monthEnd ? end : monthEnd;
    }
    let weekdays = 0;
    let saturdays = 0;
    for (let time = Date.parse(start); time <= Date.parse(end); time += 86_400_000) {
      const date = new Date(time);
      if (schedule.daysOff.has(date.toISOString().slice(0, 10))) continue;
      const weekday = date.getUTCDay();
      if (weekday === 6) saturdays++;
      else if (weekday !== 0) weekdays++;
    }
    return { start, end, hours: weekdays * schedule.weekday + saturdays * schedule.saturday };
  }

  function byOperator(scope, operator) {
    const names = operator ? [operator] : opNames;
    const totals = new Map(names.map(name => [name, { name, maps: 0, items: 0 }]));
    const mapOwners = new Map();
    for (const map of scope.maps) {
      const total = totals.get(map.operator);
      if (!total) continue;
      total.maps++;
      mapOwners.set(map.id, total);
    }
    for (const item of scope.items) {
      if (item.status !== "stocked") continue;
      const total = mapOwners.get(item.mapId);
      if (total) total.items++;
    }
    return [...totals.values()].sort((a, b) => b.items - a.items || b.maps - a.maps);
  }

  function metric(key, label, value, detail, style = "") {
    return `<article class="metric ${style}" data-productivity-metric="${key}">
      <div class="metric-label">${label}</div><strong>${value}</strong><small>${detail}</small>
    </article>`;
  }

  function scheduleForm(period) {
    const range = period.start <= period.end
      ? `Período de ${day(period.start)} a ${day(period.end)}.`
      : "Nenhum dia coberto pelo recorte.";
    const daysOff = [...schedule.daysOff].sort().map(day).join(", ");
    return `<section class="card productivity-schedule" aria-labelledby="productivity-schedule-title">
      <h3 id="productivity-schedule-title">Jornada prevista</h3>
      <p class="description productivity-period">${range} ${formatHours(period.hours)} h por operador no recorte · ${formatHours(schedule.weekday * 5 + schedule.saturday)} h semanais na escala.</p>
      <form id="productivity-schedule" novalidate>
        <div class="productivity-fields">
          <label><span>Horas líquidas de segunda a sexta</span><input id="productivity-weekday" type="number" min="0" max="${maxDailyHours}" step="any" value="${schedule.weekday}" required></label>
          <label><span>Horas líquidas por sábado</span><input id="productivity-saturday" type="number" min="0" max="${maxDailyHours}" step="any" value="${schedule.saturday}" required></label>
          <label><span>Dias sem expediente da equipe</span><input id="productivity-days-off" type="text" value="${html(daysOff)}" placeholder="dd/mm/aaaa, dd/mm/aaaa" aria-describedby="productivity-schedule-help"></label>
          <button class="button" type="submit">Aplicar jornada</button>
        </div>
        <p class="description" id="productivity-schedule-help">Desconte os intervalos. A jornada normal do período usa até 8 h diárias e 44 h semanais. Domingos valem 0 h. Separe feriados e folgas da equipe por vírgulas.</p>
        <p class="productivity-error" id="productivity-error" role="alert" hidden></p>
      </form>
    </section>`;
  }

  function render(scope, { month, operator, category, type }) {
    const period = coveredDays(month);
    const people = byOperator(scope, operator);
    const totalMaps = people.reduce((sum, person) => sum + person.maps, 0);
    const totalItems = people.reduce((sum, person) => sum + person.items, 0);
    const teamHours = people.length * period.hours;
    const rows = people.map(person => row([
      cell(html(person.name), "emph"), num(person.maps), num(person.items),
      cell(formatHours(period.hours), "num"),
      cell(rate(person.maps, period.hours), "num"), cell(rate(person.items, period.hours), "num emph"),
    ]));
    const scopeNote = category || type ? "<p class=\"notice\">Categoria e tipo de mapa alteram os volumes concluídos. A jornada prevista continua a mesma.</p>" : "";
    return `<div class="productivity">
      <div class="section-heading"><h2>Produtividade por operador</h2><p>Mês de finalização do mapa · Taxas estimadas</p></div>
      <div class="kpis productivity-kpis">
        ${metric("maps", "Mapas concluídos", count(totalMaps), "Mapas finalizados com situação Estocado")}
        ${metric("items", "Quantidade de itens abastecidos", count(totalItems), "Linhas estocadas nos mapas concluídos", "stocked")}
        ${metric("hours", "Horas previstas da equipe", formatHours(teamHours), "Soma das horas previstas por operador")}
        ${metric("mapsPerHour", "Mapas por hora prevista", rate(totalMaps, teamHours), "Mapas concluídos ÷ horas da equipe", "average")}
        ${metric("itemsPerHour", "Itens por hora prevista", rate(totalItems, teamHours), "Itens abastecidos ÷ horas da equipe", "sla")}
      </div>
      ${scheduleForm(period)}
      ${scopeNote}
      ${teamHours ? "" : '<p class="notice">As taxas ficam indisponíveis quando a jornada prevista soma 0 h.</p>'}
      <article class="card table-card productivity-results"><div class="table-head">
        <div><h3>Produção e taxas por operador</h3><p class="description">Cada linha apresenta as entregas do operador e a jornada estimada para o período.</p></div>
      </div>${table([["Operador"], ["Mapas concluídos", 1], ["Itens abastecidos", 1], ["Horas previstas", 1], ["Mapas por hora prevista", 1], ["Itens por hora prevista", 1]], rows, "Nenhum operador no recorte.")}</article>
      <details class="method productivity-method"><summary>Como as taxas são calculadas</summary>
        <div>
          <p>Os volumes usam a data de finalização do mapa. Um item abastecido corresponde a uma linha com situação Estocado em mapa concluído. A equipe usa a soma das entregas dividida pela soma das horas previstas.</p>
          <p>A jornada usa dias inteiros entre o início da base e o corte, limitada ao mês selecionado. Os dias de início e corte podem ter cobertura parcial. A mesma jornada é estimada para cada operador do recorte, inclusive quando não há entrega registrada.</p>
          <p>O padrão de 8 h de segunda a sexta e 4 h no sábado soma 44 h semanais para este período histórico. Os campos permitem ajustar horas líquidas e datas sem jornada para toda a equipe. As planilhas não registram ponto, intervalos individuais nem horas extras.</p>
          <p>A jornada inicial desconta 7 de setembro, 12 de outubro e 2 de novembro, feriados nacionais no período da base. Adicione as folgas e os feriados locais da equipe no campo de dias sem expediente. <a href="https://legis.sigepe.gov.br/sigepe-bgp-ws-legis/legis-service/download/?id=0026440285-ALPDF%2F2025" target="_blank" rel="noopener">Calendário nacional de 2026</a></p>
          <p>A base termina antes da redução do limite semanal para 42 h em 16/12/2026 e 40 h em 16/12/2027. <a href="https://www2.camara.leg.br/legin/fed/emecon/2026/emendaconstitucional-141-16-outubro-2026-800062-publicacaooriginal-181622-pl.html" target="_blank" rel="noopener">Emenda Constitucional 141/2026</a></p>
        </div>
      </details>
    </div>`;
  }

  function validDate(value) {
    const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    const iso = dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const time = Date.parse(iso);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : null;
  }

  function apply(form) {
    const weekday = form.querySelector("#productivity-weekday");
    const saturday = form.querySelector("#productivity-saturday");
    const dates = form.querySelector("#productivity-days-off");
    const error = form.querySelector("#productivity-error");
    for (const input of [weekday, saturday, dates]) input.removeAttribute("aria-invalid");
    error.hidden = true;
    const invalid = (input, message) => {
      error.textContent = message;
      error.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return false;
    };
    for (const input of [weekday, saturday]) {
      const value = input.valueAsNumber;
      if (!Number.isFinite(value) || value < 0 || value > maxDailyHours) {
        return invalid(input, "Informe de 0 a 8 horas líquidas para cada tipo de dia.");
      }
    }
    if (weekday.valueAsNumber * 5 + saturday.valueAsNumber > maxWeeklyHours) {
      return invalid(saturday, "A soma de segunda a sábado deve ser de até 44 horas semanais.");
    }
    const daysOff = dates.value.split(/[\s,;]+/).filter(Boolean).map(validDate);
    if (daysOff.includes(null)) return invalid(dates, "Use datas válidas no formato dd/mm/aaaa para as folgas e os feriados.");
    schedule.weekday = weekday.valueAsNumber;
    schedule.saturday = saturday.valueAsNumber;
    schedule.daysOff = new Set(daysOff);
    return true;
  }

  return { render, apply };
}
