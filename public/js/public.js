import { db, firebaseError, configIncompleta, collection, onSnapshot } from "./firebase-config.js"
import {
  computePlayerStats,
  computeStandings,
  leaders,
  avg,
  STAT_LABELS,
} from "./stats-engine.js"

let teams = []
let games = []
let currentView = "standings"
let mode = "total" // "total" | "promedio"
let connected = false

const contentEl = document.getElementById("content")
const toggleWrap = document.getElementById("mode-toggle-wrap")

function showBanner(msg) {
  const b = document.getElementById("fb-banner")
  if (!b) return
  b.innerHTML = msg
  b.hidden = false
}

// =========================================================
//  NAVEGACIÓN (se registra SIEMPRE, sin depender de Firebase)
// =========================================================
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab")
  if (!btn) return
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"))
  btn.classList.add("active")
  currentView = btn.dataset.view
  render()
})

function renderToggle() {
  if (currentView === "standings") {
    toggleWrap.innerHTML = ""
    return
  }
  toggleWrap.innerHTML = `
    <div class="toggle-group" role="group" aria-label="Total o promedio">
      <button data-mode="total" class="${mode === "total" ? "active" : ""}">Totales</button>
      <button data-mode="promedio" class="${mode === "promedio" ? "active" : ""}">Promedio</button>
    </div>`
  toggleWrap.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      mode = b.dataset.mode
      render()
    })
  })
}

function render() {
  renderToggle()

  if (!connected) {
    contentEl.innerHTML = `<div class="panel"><div class="empty">Esperando conexión con Firebase…</div></div>`
    return
  }

  if (currentView === "standings") {
    renderStandings()
  } else {
    renderLeaders(currentView)
  }
}

function fmt(n) {
  return Number.isInteger(n) ? n.toString() : n.toFixed(1)
}

function renderStandings() {
  const table = computeStandings(teams, games)
  if (!table.length) {
    contentEl.innerHTML = `<div class="panel"><div class="empty">Aún no hay equipos registrados.</div></div>`
    return
  }
  const rows = table
    .map((t, i) => {
      const rankClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""
      return `
      <tr>
        <td class="rank ${rankClass}">${i + 1}</td>
        <td><span class="player-cell"><span class="name">${esc(t.nombre)}</span></span></td>
        <td class="num">${t.jj}</td>
        <td class="num win">${t.ganados}</td>
        <td class="num loss">${t.perdidos}</td>
        <td class="num">${t.puntosFavor}</td>
        <td class="num">${t.puntosContra}</td>
        <td class="num">${t.diff > 0 ? "+" : ""}${t.diff}</td>
      </tr>`
    })
    .join("")

  contentEl.innerHTML = `
    <div class="panel">
      <div class="panel-title">Tabla de posiciones</div>
      <table>
        <thead>
          <tr>
            <th class="rank">#</th>
            <th>Equipo</th>
            <th class="num">JJ</th>
            <th class="num">G</th>
            <th class="num">P</th>
            <th class="num">PF</th>
            <th class="num">PC</th>
            <th class="num">DIF</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

function renderLeaders(statKey) {
  const players = computePlayerStats(teams, games)
  const list = leaders(players, statKey, mode)
  const label = STAT_LABELS[statKey]
  const modeLabel = mode === "promedio" ? "Promedio por juego" : "Total"

  if (!list.length) {
    contentEl.innerHTML = `<div class="panel"><div class="empty">No hay estadísticas registradas todavía.</div></div>`
    return
  }

  const rows = list
    .map((p, i) => {
      const rankClass = i === 0 ? "top1" : i === 1 ? "top2" : i === 2 ? "top3" : ""
      return `
      <tr>
        <td class="rank ${rankClass}">${i + 1}</td>
        <td>
          <span class="player-cell">
            <span class="name">${esc(p.nombre)} ${p.numero !== "" ? `<span class="subtle">#${esc(String(p.numero))}</span>` : ""}</span>
            <span class="team">${esc(p.teamName)}</span>
          </span>
        </td>
        <td class="num"><span class="big-value">${fmt(p.value)}</span></td>
        <td class="num">${p.totals.jj}</td>
        <td class="num">${fmt(p.totals[statKey])}</td>
        <td class="num">${fmt(avg(p.totals[statKey], p.totals.jj))}</td>
      </tr>`
    })
    .join("")

  contentEl.innerHTML = `
    <div class="panel">
      <div class="panel-title">
        <span>Líderes en ${esc(label)}</span>
        <span class="subtle">${modeLabel}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th class="rank">#</th>
            <th>Jugador</th>
            <th class="num">${mode === "promedio" ? "PROM" : "TOTAL"}</th>
            <th class="num">JJ</th>
            <th class="num">TOT</th>
            <th class="num">PROM</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
}

// =========================================================
//  CONEXIÓN A FIREBASE (al final; la navegación ya funciona)
// =========================================================
function initFirebase() {
  if (configIncompleta) {
    showBanner(
      'Falta configurar Firebase. Abre <code>public/js/firebase-config.js</code> y reemplaza <code>apiKey: "TU_API_KEY"</code> con tu clave real.'
    )
    contentEl.innerHTML = `<div class="panel"><div class="empty">Configura Firebase para ver los datos.</div></div>`
    return
  }
  if (!db) {
    showBanner("No se pudo conectar a Firebase: " + (firebaseError?.message || "error desconocido"))
    return
  }

  let loadedTeams = false
  let loadedGames = false
  const maybeReady = () => {
    if (loadedTeams && loadedGames) {
      connected = true
      render()
    }
  }

  onSnapshot(
    collection(db, "teams"),
    (snap) => {
      teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      loadedTeams = true
      maybeReady()
      if (connected) render()
    },
    (err) => showBanner("Error leyendo datos: " + err.message + ". Revisa las reglas de Firestore.")
  )

  onSnapshot(
    collection(db, "games"),
    (snap) => {
      games = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      loadedGames = true
      maybeReady()
      if (connected) render()
    },
    (err) => showBanner("Error leyendo datos: " + err.message + ". Revisa las reglas de Firestore.")
  )
}

initFirebase()
