const CONFIG = {
  appName: "silvan-tiles",
  itemMasterReports: [
    "API_ITEM_MASTER",
  ],
  sourceReport: "LOCATION_STOCK1",
  fields: {
    item: ["ITEM_NAME", "Item", "Item_Name", "ITEM", "Product", "Product_Name", "SKU"],
    sku: ["SKU", "Item_Code", "ITEM_CODE", "Code"],
    warehouse: ["Warehouse", "Warehouse_Name", "WAREHOUSE", "Godown", "Godown_Name"],
    location: ["Location", "Location_Name", "LOCATION", "Bin", "Rack"],
    batch: ["BATCH_NO", "Batch", "Batch_No", "Batch_Number", "BATCH", "Batch_Name"],
    expiry: ["Expiry_Date", "Expiry", "EXPIRY_DATE"],
    available: ["Available_Stock", "Available_Qty", "Stock", "Quantity", "Qty", "QTY"],
    reserved: ["Reserved_Stock", "Reserved_Qty", "Reserved"],
    uom: ["UOM", "Unit", "Units"],
  },
};

const state = {
  items: [],
  allRows: [],
  itemMasterLoaded: false,
  selectedItem: null,
};

const el = {
  form: document.querySelector("#searchForm"),
  loadStock: document.querySelector("#loadStockButton"),
  loadingOverlay: document.querySelector("#loadingOverlay"),
  detailsModal: document.querySelector("#detailsModal"),
  detailsModalTitle: document.querySelector("#detailsModalTitle"),
  detailsModalSubtitle: document.querySelector("#detailsModalSubtitle"),
  detailsModalContent: document.querySelector("#detailsModalContent"),
  closeDetailsModal: document.querySelector("#closeDetailsModal"),
  search: document.querySelector("#itemSearch"),
  itemResults: document.querySelector("#itemResults"),
  stockList: document.querySelector("#stockList"),
  status: document.querySelector("#status"),
  totalAvailable: document.querySelector("#totalAvailable"),
  warehouseCount: document.querySelector("#warehouseCount"),
  locationCount: document.querySelector("#locationCount"),
  batchCount: document.querySelector("#batchCount"),
};

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  applyStockSearch(el.search.value.trim());
});

el.search.addEventListener("input", debounce(() => {
  state.selectedItem = null;
  filterItemMaster(el.search.value.trim());
}, 350));

el.loadStock.addEventListener("click", () => {
  loadItemMasterData();
});

el.closeDetailsModal.addEventListener("click", closeWarehouseDetails);
el.detailsModal.addEventListener("click", (event) => {
  if (event.target === el.detailsModal) {
    closeWarehouseDetails();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.detailsModal.hidden) {
    closeWarehouseDetails();
  }
});

resetView("Click Load Stock to load item master.");
setStatus("Click Load Stock to fetch API_ITEM_MASTER, then select an item and click Apply.");

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

async function loadItemMasterData() {
  const startedAt = Date.now();
  try {
    setLoading(true);
    el.loadStock.textContent = "Loading...";
    el.loadStock.classList.remove("is-loaded");
    setStatus("Loading item master from API_ITEM_MASTER...");
    el.itemResults.innerHTML = "";
    await waitForPaint();
    if (isLocalPreview()) {
      throw new Error("Local preview is not logged into Zoho Creator. Open this widget inside Creator to load API_ITEM_MASTER.");
    }
    await initializeCreatorSdk();
    state.items = await loadItemMaster();
    state.itemMasterLoaded = true;
    state.selectedItem = null;
    renderItemSuggestions("");
    resetView("Select item - item code, then click Apply.");
    el.loadStock.textContent = "Masters Loaded";
    el.loadStock.classList.add("is-loaded");
    setStatus(`Loaded ${state.items.length} item master record${state.items.length === 1 ? "" : "s"} from API_ITEM_MASTER.`);
  } catch (error) {
    el.loadStock.textContent = "Load Stock";
    el.loadStock.classList.remove("is-loaded");
    showError(error, "Unable to load API_ITEM_MASTER data.");
  } finally {
    await wait(Math.max(0, 500 - (Date.now() - startedAt)));
    setLoading(false);
  }
}

function filterItemMaster(term) {
  if (!state.itemMasterLoaded) {
    setStatus("Click Load Stock to fetch API_ITEM_MASTER before searching.");
    return;
  }

  if (!term) {
    renderItemSuggestions("");
    resetView("Select item - item code, then click Apply.");
    setStatus("Select item - item code and click Apply.");
    return;
  }

  renderItemSuggestions(term);
  setStatus("Select item - item code from API_ITEM_MASTER, then click Apply.");
}

async function applyStockSearch(term) {
  if (!state.itemMasterLoaded) {
    setStatus("Click Load Stock to fetch API_ITEM_MASTER before applying.");
    return;
  }

  const selected = getSelectedItem(term);
  if (!selected) {
    setStatus("Select a valid item - item code from API_ITEM_MASTER, then click Apply.", true);
    return;
  }

  try {
    state.selectedItem = selected;
    setStatus(`Loading LOCATION_STOCK1 for ${formatItemLabel(selected)}...`);
    resetView("Loading Location_Stock records...");
    state.allRows = await getAllRecords({
      report_name: CONFIG.sourceReport,
      field_config: "all",
      max_records: 1000,
    });
    const rows = state.allRows.filter((row) => rowMatchesSelectedItem(row, selected));
    renderStock(groupRows(rows));
    setStatus(rows.length ? `Showing ${rows.length} Location_Stock rows for ${formatItemLabel(selected)}.` : `No Location_Stock rows found for ${formatItemLabel(selected)}.`);
  } catch (error) {
    showError(error, "Unable to load LOCATION_STOCK1 data.");
  }
}

function getSelectedItem(term) {
  if (state.selectedItem && formatItemLabel(state.selectedItem) === term) {
    return state.selectedItem;
  }

  const normalizedTerm = normalizeText(term);
  return state.items.find((item) => {
    return normalizeText(formatItemLabel(item)) === normalizedTerm
      || normalizeText(item.sku) === normalizedTerm
      || normalizeText(item.item) === normalizedTerm;
  });
}

function rowMatchesSelectedItem(row, selected) {
  const rowItem = displayByCandidates(row, CONFIG.fields.item, "");
  const rowSku = displayByCandidates(row, CONFIG.fields.sku, "");
  return valuesMatch(rowSku, selected.sku)
    || valuesMatch(rowItem, selected.item)
    || valueContains(rowItem, selected.sku)
    || valueContains(rowItem, selected.item);
}

function valuesMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return normalizeText(left) === normalizeText(right);
}

function valueContains(left, right) {
  if (!left || !right) {
    return false;
  }
  return normalizeText(left).includes(normalizeText(right));
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function renderItemSuggestions(term) {
  el.itemResults.innerHTML = "";
  const searchText = term.toLowerCase();
  const matches = state.items.filter(({ item, sku }) => {
    if (!searchText) {
      return true;
    }
    return `${item} ${sku}`.toLowerCase().includes(searchText);
  });

  matches.slice(0, 12).forEach((itemRecord) => {
    const { item, sku } = itemRecord;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item-button";
    button.innerHTML = `<span>${escapeHtml(item)}</span><span class="item-code">${escapeHtml(sku)}</span>`;
    button.addEventListener("click", () => {
      state.selectedItem = itemRecord;
      el.search.value = formatItemLabel(state.selectedItem);
      el.itemResults.innerHTML = "";
      resetView("Click Apply to fetch LOCATION_STOCK1 and show grouped stock.");
      setStatus(`Selected ${formatItemLabel(state.selectedItem)}. Click Apply.`);
    });
    el.itemResults.appendChild(button);
  });

  if (term && !matches.length) {
    el.itemResults.innerHTML = `<p class="item-empty">No item master records found for "${escapeHtml(term)}".</p>`;
  }
}


function groupRows(rows) {
  const warehouses = new Map();

  rows.forEach((row) => {
    const warehouse = displayByCandidates(row, CONFIG.fields.warehouse, "Warehouse not set");
    if (!warehouses.has(warehouse)) {
      warehouses.set(warehouse, { warehouse, rows: [], locations: new Map() });
    }

    const group = warehouses.get(warehouse);
    group.rows.push(row);

    const location = displayByCandidates(row, CONFIG.fields.location, "Location not set");
    const batch = displayByCandidates(row, CONFIG.fields.batch, "Batch not set");
    const expiry = displayByCandidates(row, CONFIG.fields.expiry, "-");
    const available = toNumber(valueByCandidates(row, CONFIG.fields.available));

    if (!group.locations.has(location)) {
      group.locations.set(location, { location, available: 0, batches: new Map() });
    }

    const locationGroup = group.locations.get(location);
    locationGroup.available += available;
    upsertQuantity(locationGroup.batches, `${batch}::${expiry}`, { location, batch, expiry, available });
  });

  return Array.from(warehouses.values());
}

function upsertQuantity(map, key, next) {
  const current = map.get(key);
  if (!current) {
    map.set(key, next);
    return;
  }
  current.available += next.available || 0;
}

async function getAllRecords(config) {
  if (!window.ZOHO?.CREATOR?.DATA?.getRecords) {
    throw new Error("Zoho Creator widget SDK is not available.");
  }

  const rows = [];
  let cursor = "";

  do {
    const request = { ...config };
    if (CONFIG.appName) {
      request.app_name = CONFIG.appName;
    }
    if (cursor) {
      request.record_cursor = cursor;
    }

    const response = await withTimeout(
      window.ZOHO.CREATOR.DATA.getRecords(request),
      10000,
      `Creator API timed out while loading ${request.report_name}.`
    );
    if (response.code !== 3000) {
      throw new Error(response.message || `Creator API returned code ${response.code}`);
    }

    rows.push(...(response.data || []));
    cursor = response.record_cursor || "";
  } while (cursor);

  return rows;
}

async function initializeCreatorSdk() {
  if (!window.ZOHO?.CREATOR?.DATA?.getRecords) {
    throw new Error("Zoho Creator widget SDK is not available.");
  }
}

function isLocalPreview() {
  if (!["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
    return false;
  }
  return !window.ZOHO?.CREATOR?.DATA?.getRecords;
}

function withTimeout(promise, timeout, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeout);
    }),
  ]);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

async function loadItemMaster() {
  const errors = [];
  const reportNames = uniqueValues([
    ...CONFIG.itemMasterReports,
    ...(await findItemMasterReportNames()),
  ]);

  for (const reportName of reportNames) {
    try {
      const rows = await getAllRecords({
        report_name: reportName,
        field_config: "all",
        max_records: 1000,
      });
      const items = normalizeItemRows(rows);
      if (items.length) {
        return items;
      }
    } catch (error) {
      errors.push(`${reportName}: ${error.message || error}`);
    }
  }

  console.warn("Unable to load configured item master reports.", errors);
  return [];
}

async function findItemMasterReportNames() {
  if (typeof window.ZOHO.CREATOR.META?.getReports !== "function") {
    return [];
  }

  try {
    const request = {};
    if (CONFIG.appName) {
      request.app_name = CONFIG.appName;
    }
    const response = await withTimeout(
      window.ZOHO.CREATOR.META.getReports(request),
      10000,
      "Creator API timed out while reading report metadata."
    );
    if (response.code !== 3000) {
      return [];
    }
    return (response.reports || [])
      .filter((report) => {
        const name = `${report.display_name || ""} ${report.link_name || ""}`.toLowerCase();
        return name.includes("item") && name.includes("master");
      })
      .map((report) => report.link_name)
      .filter(Boolean);
  } catch (error) {
    console.warn("Unable to discover item master report.", error);
    return [];
  }
}

function normalizeItemRows(rows) {
  const uniqueItems = new Map();

  rows.forEach((row) => {
    const item = displayByCandidates(row, CONFIG.fields.item, "");
    const sku = displayByCandidates(row, CONFIG.fields.sku, "");
    if (!item && !sku) {
      return;
    }
    const key = `${item}::${sku}`;
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, {
        item: item || sku,
        sku,
        tiles: booleanValue(row.Tiles),
        multiUnit: booleanValue(row.Multi_Unit),
        unitMap: buildUnitMap(row.Tiles_Information),
      });
    }
  });

  return Array.from(uniqueItems.values()).sort((a, b) => {
    return `${a.item} ${a.sku}`.localeCompare(`${b.item} ${b.sku}`);
  });
}

function booleanValue(value) {
  return normalizeText(normalizeDisplay(value)) === "true";
}

function buildUnitMap(rows) {
  const unitMap = {};

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const unit = normalizeText(normalizeDisplay(row?.Package_Type?.Unit || row?.Package_Type));
    const multiplier = toNumber(row?.NOS);
    if (unit && multiplier > 0) {
      unitMap[unit] = multiplier;
    }
  });

  return unitMap;
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatItemLabel({ item, sku }) {
  return sku ? `${item} - ${sku}` : item;
}

function renderStock(groups) {
  el.stockList.innerHTML = "";

  if (!groups.length) {
    el.stockList.innerHTML = `<tr><td colspan="4" class="matrix-empty">No stock rows found.</td></tr>`;
    updateSummary([]);
    return;
  }

  groups.forEach((group) => {
    const warehouseTotal = sumRows(group.rows, CONFIG.fields.available);
    const summaryRow = document.createElement("tr");
    summaryRow.className = "warehouse-summary-row";
    summaryRow.innerHTML = `
      <td><strong class="warehouse-title">${escapeHtml(group.warehouse)}</strong></td>
      <td><strong class="stock-number">${formatNos(warehouseTotal)}</strong></td>
      <td>${formatBoxes(warehouseTotal)}</td>
      <td>
        <button type="button" class="details-button">View Details</button>
      </td>
    `;

    summaryRow.querySelector(".details-button").addEventListener("click", () => {
      openWarehouseDetails(group, warehouseTotal);
    });

    el.stockList.appendChild(summaryRow);
  });

  updateSummary(groups);
}

function openWarehouseDetails(group, warehouseTotal) {
  el.detailsModalTitle.textContent = group.warehouse;
  el.detailsModalSubtitle.textContent = `${formatNos(warehouseTotal)} / ${formatBoxes(warehouseTotal)}`;
  el.detailsModalContent.innerHTML = renderWarehouseDetails(group);
  el.detailsModal.hidden = false;
  document.body.classList.add("modal-open");
  el.closeDetailsModal.focus();
}

function closeWarehouseDetails() {
  el.detailsModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderWarehouseDetails(group) {
  const rows = [];

  Array.from(group.locations.values()).forEach((location) => {
    const batches = Array.from(location.batches.values());
    (batches.length ? batches : [{ batch: "-", available: 0 }]).forEach((batch, index) => {
      rows.push(`
        <tr>
          <td>${index === 0 ? escapeHtml(location.location) : ""}</td>
          <td>${index === 0 ? formatNos(location.available) : ""}</td>
          <td>${index === 0 ? formatBoxes(location.available) : ""}</td>
          <td>${escapeHtml(batch.batch)}</td>
          <td>${formatNos(batch.available)}</td>
          <td>${formatBoxes(batch.available)}</td>
        </tr>
      `);
    });
  });

  return `
    <table class="detail-table">
      <thead>
        <tr>
          <th>Location</th>
          <th>Location Stock (Nos)</th>
          <th>Location Stock (Boxes)</th>
          <th>Batch</th>
          <th>Batch Stock (Nos)</th>
          <th>Batch Stock (Boxes)</th>
        </tr>
      </thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function updateSummary(groups) {
  const total = groups.reduce((sum, group) => sum + sumRows(group.rows, CONFIG.fields.available), 0);
  const locationTotal = groups.reduce((sum, group) => sum + group.locations.size, 0);
  const batchTotal = groups.reduce((sum, group) => sum + Array.from(group.locations.values()).reduce((locationSum, location) => locationSum + location.batches.size, 0), 0);

  el.totalAvailable.textContent = boxFactor() ? `${formatNos(total)} / ${formatBoxes(total)}` : formatNos(total);
  el.warehouseCount.textContent = groups.length;
  el.locationCount.textContent = locationTotal;
  el.batchCount.textContent = batchTotal;
}

function resetView(message = "Loading stock rows...") {
  el.stockList.innerHTML = `<tr><td colspan="4" class="matrix-empty">${escapeHtml(message)}</td></tr>`;
  updateSummary([]);
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  el.loadingOverlay.hidden = false;
  el.loadingOverlay.classList.toggle("is-visible", isLoading);
  document.body.classList.toggle("is-loading", isLoading);
  if (!isLoading) {
    el.loadingOverlay.hidden = true;
  }
}


function showError(error, fallback) {
  console.error(error);
  setStatus(`${fallback} ${error.message || ""}`.trim(), true);
}

function sumRows(rows, candidates) {
  return rows.reduce((sum, row) => sum + toNumber(valueByCandidates(row, candidates)), 0);
}

function sumValues(rows, field) {
  return rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
}

function boxFactor() {
  const item = state.selectedItem;
  if (!item?.tiles || !item?.multiUnit) {
    return 0;
  }
  return toNumber(item.unitMap?.box);
}

function formatNos(quantity) {
  return `${numberText(quantity)} Nos`;
}

function formatBoxes(quantity) {
  const factor = boxFactor();
  if (!factor) {
    return "N/A";
  }

  const totalNos = toNumber(quantity);
  const fullBoxes = Math.floor(totalNos / factor);
  const looseNos = totalNos - (fullBoxes * factor);
  const boxLabel = `${numberText(fullBoxes)} ${fullBoxes === 1 ? "Box" : "Boxes"}`;

  return looseNos > 0 ? `${boxLabel}, ${numberText(looseNos)} Nos` : boxLabel;
}

function valueByCandidates(record, candidates) {
  const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(record, candidate));
  return key ? record[key] : "";
}

function displayByCandidates(record, candidates, fallback) {
  const raw = valueByCandidates(record, candidates);
  const display = normalizeDisplay(raw);
  return display || fallback;
}

function normalizeDisplay(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return "";
  }
  if (typeof raw === "object") {
    if (Array.isArray(raw)) {
      return raw.map(normalizeDisplay).filter(Boolean).join(", ");
    }
    const directValue = raw.zc_display_value || raw.display_value || raw.name;
    if (directValue) {
      return String(directValue);
    }
    const nestedValue = Object.entries(raw).find(([key, value]) => key !== "ID" && value !== null && value !== undefined && value !== "" && typeof value !== "object");
    return nestedValue ? String(nestedValue[1]) : raw.ID || "";
  }
  return String(raw);
}

function toNumber(raw) {
  const normalized = normalizeDisplay(raw);
  const number = Number(String(normalized || 0).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function numberText(raw) {
  return toNumber(raw).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
