// ===============================
// CONFIG — paste your Apps Script /exec URL
// GET  /exec?mode=catalog  -> { ok:true, catalog:[{item,toBuy,toSell,weBuy}] }
// POST /exec               -> saves order
// ===============================
const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbXXXXXXXXXXXX/exec";

const $ = (id) => document.getElementById(id);
let catalog = [];
let filtered = [];
const qtyMap = new Map(); // item -> qty

function money(n){
  const v = Number(n || 0);
  return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function nowStamp(){ return new Date().toLocaleString(); }

function setMsg(text, good=false){
  const el = $("msg");
  el.textContent = text || "";
  el.style.color = good ? "rgba(34,197,94,.9)" : "rgba(234,240,247,.7)";
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/"/g, "&quot;"); }

function getPriceMode(){
  const el = document.querySelector('input[name="priceMode"]:checked');
  return el ? el.value : "weBuy"; // weBuy | toBuy | toSell
}
function getUnitPrice(it){
  const mode = getPriceMode();
  if (mode === "toBuy") return Number(it.toBuy || 0);
  if (mode === "toSell") return Number(it.toSell || 0);
  return Number(it.weBuy || 0);
}

function render(){
  const rows = $("rows");
  rows.innerHTML = "";

  const q = ($("filter").value || "").trim().toLowerCase();
  filtered = catalog.filter(x => !q || x.item.toLowerCase().includes(q));

  $("catalogPill").textContent = `Catalog loaded: ${catalog.length} items`;

  for(const it of filtered){
    const qty = qtyMap.get(it.item) || 0;
    const unit = getUnitPrice(it);
    const line = unit * qty;

    const tr = document.createElement("div");
    tr.className = "tr";

    tr.innerHTML = `
      <div class="item">${escapeHtml(it.item)}</div>
      <div class="num">${money(it.weBuy)}</div>
      <div class="num">${money(it.toBuy)}</div>
      <div class="num">${money(it.toSell)}</div>
      <div class="num">
        <input class="qty" inputmode="numeric" pattern="[0-9]*" value="${qty}" data-item="${escapeAttr(it.item)}" />
      </div>
      <div class="num lineTotal" data-item="${escapeAttr(it.item)}">${money(line)}</div>
    `;

    rows.appendChild(tr);
  }

  hookQtyInputs();
  recalcTotals();
}

function hookQtyInputs(){
  document.querySelectorAll(".qty").forEach(inp => {
    if (inp.dataset.bound === "1") return;
    inp.dataset.bound = "1";

    inp.addEventListener("input", (e) => {
      const item = e.target.getAttribute("data-item");
      const raw = (e.target.value || "").replace(/[^\d]/g,"");
      const qty = raw ? Math.min(parseInt(raw,10), 9999) : 0;
      e.target.value = String(qty);
      qtyMap.set(item, qty);

      updateLine(item);
      recalcTotals();
    });
  });
}

function updateLine(item){
  const it = catalog.find(x => x.item === item);
  if(!it) return;
  const qty = qtyMap.get(item) || 0;
  const unit = getUnitPrice(it);
  const line = unit * qty;

  const cell = document.querySelector(`.lineTotal[data-item="${CSS.escape(item)}"]`);
  if(cell) cell.textContent = money(line);
}

function recalcTotals(){
  let totalItems = 0;
  let total = 0;
  let totalBuyBaseline = 0;

  for(const it of catalog){
    const qty = qtyMap.get(it.item) || 0;
    if(qty <= 0) continue;

    totalItems += qty;
    total += getUnitPrice(it) * qty;
    totalBuyBaseline += Number(it.toBuy || 0) * qty;
  }

  $("totalItems").textContent = String(totalItems);
  $("totalOwed").textContent  = money(total);

  const pct = totalBuyBaseline > 0 ? (total / totalBuyBaseline) * 100 : 0;
  $("pctBuy").textContent = pct.toFixed(1) + "%";
}

async function loadCatalog(){
  setMsg("Loading catalog…");
  try{
    const res = await fetch(`${ENDPOINT_URL}?mode=catalog`, { method:"GET" });
    const data = await res.json();
    if(!data?.ok || !Array.isArray(data.catalog)) throw new Error("Bad catalog response");

    catalog = data.catalog
      .filter(x => x?.item)
      .map(x => ({
        item: String(x.item),
        weBuy: Number(x.weBuy || 0),
        toBuy: Number(x.toBuy || 0),
        toSell: Number(x.toSell || 0),
      }));

    $("statusSub").textContent = `Last updated: ${nowStamp()}`;
    setMsg("Catalog loaded.", true);
  }catch(e){
    setMsg("Couldn’t load catalog from endpoint. Check ENDPOINT_URL in app.js.", false);
    catalog = [];
  }
  render();
}

function clearQty(){
  qtyMap.clear();
  render();
  setMsg("Quantities cleared.", true);
}

async function submitOrder(){
  const playerName = ($("playerName").value || "").trim();
  const server = ($("server").value || "").trim();
  const discord = ($("discord").value || "").trim();

  if(!playerName) return setMsg("Player name is required.");
  if(!server) return setMsg("Server is required.");

  const items = [];
  let total = 0;

  for(const it of catalog){
    const qty = qtyMap.get(it.item) || 0;
    if(qty <= 0) continue;

    const unit = getUnitPrice(it);
    const lineTotal = unit * qty;
    total += lineTotal;

    items.push({
      item: it.item,
      qty,
      unitPrice: unit,
      lineTotal
    });
  }

  if(items.length === 0) return setMsg("Add at least one item quantity.");

  const priceMode = getPriceMode();

  const payload = new URLSearchParams();
  payload.append("playerName", playerName);
  payload.append("server", server);
  payload.append("discord", discord);
  payload.append("priceMode", priceMode);
  payload.append("items_json", JSON.stringify(items));
  payload.append("items_text", items.map(i => `${i.qty}x ${i.item} @ ${i.unitPrice} = ${i.lineTotal}`).join("\n"));
  payload.append("total", String(total));
  payload.append("source", "github-pages");
  payload.append("website", "");

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";
  setMsg("Submitting order…");

  try{
    const res = await fetch(ENDPOINT_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString()
    });

    const data = await res.json();
    if(!res.ok || data?.ok === false) throw new Error(data?.message || `HTTP ${res.status}`);

    const orderId = data.orderId;
    setMsg(`Order submitted! ID: ${orderId}`, true);
    clearQty();

    // Redirect to receipt page
    window.location.href = `./receipt.html?orderId=${encodeURIComponent(orderId)}`;

  }catch(e){
    setMsg(`Submit failed: ${String(e.message || e)}`);
  }finally{
    btn.disabled = false;
    btn.textContent = "Submit Order";
  }
}

// UI events
$("filter").addEventListener("input", render);
$("clearQtyBtn").addEventListener("click", clearQty);
$("submitBtn").addEventListener("click", submitOrder);
$("refreshStatusBtn").addEventListener("click", loadCatalog);

document.querySelectorAll('input[name="priceMode"]').forEach(r => {
  r.addEventListener("change", () => render());
});

// Start
$("statusSub").textContent = "Last updated: —";
loadCatalog();
