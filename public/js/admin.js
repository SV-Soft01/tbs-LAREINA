import {
  db,
  firebaseError,
  configIncompleta,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from "./firebase-config.js"
import { STAT_KEYS, uid } from "./stats-engine.js"

let teams = []
let games = []

const STAT_COLS = [
  { key: "puntos", label: "PTS" },
  { key: "rebotes", label: "REB" },
  { key: "asistencias", label: "AST" },
  { key: "robos", label: "ROB" },
  { key: "tapones", label: "TAP" },
]

// =========================================================
//  AVISO DE FIREBASE (banner visible)
// =========================================================
function showBanner(msg) {
  const b = document.getElementById("fb-banner")
  if (!b) return
  b.innerHTML = msg
  b.hidden = false
}

// =========================================================
//  TOAST
// =========================================================
function toast(msg, isError = false) {
  const t = document.getElementById("toast")
  if (!t) return
  t.textContent = msg
  t.className = "toast show" + (isError ? " error" : "")
  setTimeout(() => (t.className = "toast" + (isError ? " error" : "")), 2400)
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
}

// Verifica que Firebase esté disponible antes de escribir.
function dbReady() {
  if (configIncompleta) {
    toast("Configura tu apiKey de Firebase para guardar datos.", true)
    return false
  }
  if (!db) {
    toast("Firebase no está configurado. Revisa el aviso de arriba.", true)
    return false
  }
  return true
}

// =========================================================
//  NAVEGACIÓN DE SECCIONES  (se registra SIEMPRE, sin depender de Firebase)
// =========================================================
document.getElementById("admin-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab")
  if (!btn) return
  document.querySelectorAll("#admin-tabs .tab").forEach((t) => t.classList.remove("active"))
  btn.classList.add("active")
  const section = btn.dataset.section
  document.querySelectorAll(".admin-section").forEach((s) => (s.hidden = true))
  document.getElementById("section-" + section).hidden = false
})

// =========================================================
//  EQUIPOS Y JUGADORES
// =========================================================
document.getElementById("add-team-btn").addEventListener("click", async () => {
  if (!dbReady()) return
  const input = document.getElementById("new-team-name")
  const nombre = input.value.trim()
  if (!nombre) return toast("Escribe un nombre de equipo", true)
  try {
    await addDoc(collection(db, "teams"), { nombre, players: [] })
    input.value = ""
    toast("Equipo agregado")
  } catch (err) {
    toast("Error: " + err.message, true)
  }
})

function renderTeams() {
  const wrap = document.getElementById("teams-list")
  if (!teams.length) {
    wrap.innerHTML = `<div class="empty">No hay equipos todavía. Crea el primero arriba.</div>`
    return
  }
  wrap.innerHTML = teams
    .map((team) => {
      const playerRows = (team.players || [])
        .map(
          (p) => `
        <div class="row-flex" style="margin-bottom:8px;" data-pid="${p.id}">
          <span class="pill">#${esc(String(p.numero ?? ""))} ${esc(p.nombre)}</span>
          <span class="shrink">
            <button class="btn danger" data-action="del-player" data-team="${team.id}" data-pid="${p.id}">Eliminar</button>
          </span>
        </div>`
        )
        .join("")

      return `
      <div class="team-block" data-team="${team.id}">
        <div class="team-head">
          <h3>${esc(team.nombre)}</h3>
          <button class="btn danger" data-action="del-team" data-team="${team.id}">Eliminar equipo</button>
        </div>
        <div>${playerRows || '<p class="subtle" style="margin-bottom:8px;">Sin jugadores aún.</p>'}</div>
        <div class="row-flex" style="margin-top:10px;">
          <div class="shrink" style="min-width:90px;">
            <label>Número</label>
            <input type="number" class="np-num" placeholder="#" />
          </div>
          <div>
            <label>Nombre del jugador</label>
            <input class="np-name" placeholder="Ej. Juan Pérez" />
          </div>
          <div class="shrink">
            <label>&nbsp;</label>
            <button class="btn small" data-action="add-player" data-team="${team.id}">Agregar jugador</button>
          </div>
        </div>
      </div>`
    })
    .join("")
}

document.getElementById("teams-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button")
  if (!btn) return
  if (!dbReady()) return
  const action = btn.dataset.action
  const teamId = btn.dataset.team
  const team = teams.find((t) => t.id === teamId)

  try {
    if (action === "del-team") {
      if (!confirm("¿Eliminar este equipo y todos sus jugadores?")) return
      await deleteDoc(doc(db, "teams", teamId))
      toast("Equipo eliminado")
    } else if (action === "add-player") {
      const block = btn.closest(".team-block")
      const nombre = block.querySelector(".np-name").value.trim()
      const numero = block.querySelector(".np-num").value.trim()
      if (!nombre) return toast("Escribe el nombre del jugador", true)
      const players = [...(team.players || []), { id: uid(), nombre, numero }]
      await updateDoc(doc(db, "teams", teamId), { players })
      toast("Jugador agregado")
    } else if (action === "del-player") {
      const pid = btn.dataset.pid
      const players = (team.players || []).filter((p) => p.id !== pid)
      await updateDoc(doc(db, "teams", teamId), { players })
      toast("Jugador eliminado")
    }
  } catch (err) {
    toast("Error: " + err.message, true)
  }
})

// =========================================================
//  REGISTRAR / EDITAR JUEGO
// =========================================================
function fillTeamSelects() {
  const local = document.getElementById("game-local")
  const visit = document.getElementById("game-visitante")
  if (!local || !visit) return
  const opts = `<option value="">— Selecciona —</option>` +
    teams.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join("")
  const lv = local.value, vv = visit.value
  local.innerHTML = opts
  visit.innerHTML = opts
  local.value = lv
  visit.value = vv
}

document.getElementById("load-rosters-btn").addEventListener("click", () => {
  const localId = document.getElementById("game-local").value
  const visitId = document.getElementById("game-visitante").value
  if (!localId || !visitId) return toast("Selecciona ambos equipos", true)
  if (localId === visitId) return toast("Elige dos equipos distintos", true)
  renderGameForm({ localId, visitId })
})

// Construye el formulario de captura de estadísticas.
function renderGameForm({ localId, visitId, existing = null }) {
  const local = teams.find((t) => t.id === localId)
  const visit = teams.find((t) => t.id === visitId)
  const area = document.getElementById("game-form-area")
  if (!local || !visit) return

  const statMap = {}
  if (existing) {
    ;[...(existing.statsLocal || []), ...(existing.statsVisitante || [])].forEach((s) => {
      statMap[s.playerId] = s
    })
  }

  function rosterRows(team) {
  return (team.players || [])
    .map((p) => {
      const s = statMap[p.id] || {}

      const inputs = STAT_COLS.map(
        (c) =>
          `<input type="number"
             min="0"
             data-stat="${c.key}"
             data-pid="${p.id}"
             value="${s[c.key] ?? 0}" />`
      ).join("")

      return `
      <div class="stat-input-row" data-player-row="${p.id}" data-name="${esc(p.nombre)}">

        <div style="display:flex;align-items:center;gap:8px;">
          <button
            type="button"
            class="btn danger small player-toggle"
            onclick="
              const row=this.closest('[data-player-row]');

              if(row.dataset.out==='true'){
                row.dataset.out='false';
                row.style.opacity='1';

                row.querySelectorAll('input[data-stat]').forEach(i=>{
                  i.disabled=false;
                });

                this.textContent='Sacar';
              }else{
                row.dataset.out='true';
                row.style.opacity='0.35';

                row.querySelectorAll('input[data-stat]').forEach(i=>{
                  i.disabled=true;
                  i.value=0;
                });

                this.textContent='Agregar';
              }
            "
          >
            Sacar
          </button>

          <span class="pname">
            #${esc(String(p.numero ?? ""))}
            ${esc(p.nombre)}
          </span>
        </div>

        ${inputs}

      </div>`
    })
    .join("")
}
  if (!(local.players || []).length || !(visit.players || []).length) {
    area.innerHTML = `<div class="panel"><div class="empty">Ambos equipos necesitan jugadores antes de registrar el juego.</div></div>`
    return
  }

  const head = `<div class="stat-input-row head">
      <span>Jugador</span>${STAT_COLS.map((c) => `<span style="text-align:center">${c.label}</span>`).join("")}
    </div>`

  area.innerHTML = `
    <div class="panel" style="padding:20px;" data-localid="${localId}" data-visitid="${visitId}" ${existing ? `data-editid="${existing.id}"` : ""}>
      <div class="grid-2">
        <div>
          <label>Marcador ${esc(local.nombre)} (Local)</label>
          <input type="number" min="0" id="score-local" value="${existing?.marcadorLocal ?? 0}" />
        </div>
        <div>
          <label>Marcador ${esc(visit.nombre)} (Visitante)</label>
          <input type="number" min="0" id="score-visit" value="${existing?.marcadorVisitante ?? 0}" />
        </div>
      </div>
      <hr class="div" />
      <h3 style="margin-bottom:10px;">${esc(local.nombre)} <span class="subtle">· Local</span></h3>
      <div id="roster-local">${head}${rosterRows(local)}</div>
      <hr class="div" />
      <h3 style="margin-bottom:10px;">${esc(visit.nombre)} <span class="subtle">· Visitante</span></h3>
      <div id="roster-visit">${head}${rosterRows(visit)}</div>
      <hr class="div" />
      <button class="btn" id="save-game-btn">${existing ? "Guardar cambios" : "Guardar juego"}</button>
      ${existing ? `<button class="btn secondary" id="cancel-edit-btn" style="margin-left:8px;">Cancelar</button>` : ""}
    </div>`

  document.getElementById("save-game-btn").addEventListener("click", () => saveGame())
  const cancel = document.getElementById("cancel-edit-btn")
  if (cancel) cancel.addEventListener("click", () => (area.innerHTML = ""))

  area.scrollIntoView({ behavior: "smooth", block: "nearest" })
}

function collectStats(containerId) {
  const rows = document.querySelectorAll(
    `#${containerId} [data-player-row]`
  )

  const result = []

  rows.forEach((row) => {

    if (row.dataset.out === "true") return

    const pid = row.dataset.playerRow
    const line = { playerId: pid }

    row.querySelectorAll("input[data-stat]").forEach((inp) => {
      line[inp.dataset.stat] = Number(inp.value) || 0
    })

    STAT_KEYS.forEach((k) => {
      line[k] = line[k] ?? 0
    })

    result.push(line)
  })

  return result
}

async function saveGame() {
  if (!dbReady()) return
  const panel = document.querySelector("#game-form-area .panel")
  if (!panel) return
  const localId = panel.dataset.localid
  const visitId = panel.dataset.visitid
  const editId = panel.dataset.editid || null

  const data = {
    localId,
    visitanteId: visitId,
    marcadorLocal: Number(document.getElementById("score-local").value) || 0,
    marcadorVisitante: Number(document.getElementById("score-visit").value) || 0,
    statsLocal: collectStats("roster-local"),
    statsVisitante: collectStats("roster-visit"),
    fecha: Date.now(),
  }

  try {
    if (editId) {
      await updateDoc(doc(db, "games", editId), data)
      toast("Juego actualizado")
    } else {
      await addDoc(collection(db, "games"), data)
      toast("Juego registrado")
    }
    document.getElementById("game-form-area").innerHTML = ""
  } catch (err) {
    toast("Error: " + err.message, true)
  }
}

// =========================================================
//  LISTA DE JUEGOS REGISTRADOS
// =========================================================
function teamName(id) {
  return teams.find((t) => t.id === id)?.nombre || "—"
}

function renderGames() {
  const wrap = document.getElementById("games-list")
  if (!wrap) return
  if (!games.length) {
    wrap.innerHTML = `<div class="empty">No hay juegos registrados todavía.</div>`
    return
  }
  const sorted = [...games].sort((a, b) => (b.fecha || 0) - (a.fecha || 0))
  wrap.innerHTML = sorted
    .map((g) => {
      const pl = Number(g.marcadorLocal) || 0
      const pv = Number(g.marcadorVisitante) || 0
      const localWin = pl > pv
      return `
      <div class="team-block">
        <div class="team-head">
          <h3>
            <span class="${localWin ? "win" : ""}">${esc(teamName(g.localId))} ${pl}</span>
            <span class="subtle"> vs </span>
            <span class="${!localWin && pv > pl ? "win" : ""}">${pv} ${esc(teamName(g.visitanteId))}</span>
          </h3>
          <div>
            <button class="btn secondary small" data-action="edit-game" data-id="${g.id}">Editar</button>
            <button class="btn danger" data-action="del-game" data-id="${g.id}">Eliminar</button>
          </div>
        </div>
        <p class="subtle">${g.fecha ? new Date(g.fecha).toLocaleString("es") : ""}</p>
      </div>`
    })
    .join("")
}

document.getElementById("games-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button")
  if (!btn) return
  const id = btn.dataset.id
  const game = games.find((g) => g.id === id)
  if (!game) return

  if (btn.dataset.action === "del-game") {
    if (!dbReady()) return
    if (!confirm("¿Eliminar este juego? Las estadísticas se recalcularán.")) return
    try {
      await deleteDoc(doc(db, "games", id))
      toast("Juego eliminado")
    } catch (err) {
      toast("Error: " + err.message, true)
    }
  } else if (btn.dataset.action === "edit-game") {
    document.querySelectorAll("#admin-tabs .tab").forEach((t) => t.classList.remove("active"))
    document.querySelector('[data-section="newgame"]').classList.add("active")
    document.querySelectorAll(".admin-section").forEach((s) => (s.hidden = true))
    document.getElementById("section-newgame").hidden = false
    document.getElementById("game-local").value = game.localId
    document.getElementById("game-visitante").value = game.visitanteId
    renderGameForm({ localId: game.localId, visitId: game.visitanteId, existing: game })
  }
})

// =========================================================
//  CONEXIÓN A FIREBASE (al final; la UI ya funciona sin esto)
// =========================================================
function initFirebase() {
  if (configIncompleta) {
    showBanner(
      'Falta configurar Firebase. Abre <code>public/js/firebase-config.js</code> y reemplaza <code>apiKey: "TU_API_KEY"</code> con tu clave real de la consola de Firebase. Mientras tanto puedes navegar las pestañas, pero no se guardarán datos.'
    )
    renderTeams()
    renderGames()
    return
  }
  if (!db) {
    showBanner("No se pudo conectar a Firebase: " + (firebaseError?.message || "error desconocido"))
    renderTeams()
    renderGames()
    return
  }

  onSnapshot(
    collection(db, "teams"),
    (snap) => {
      teams = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      renderTeams()
      fillTeamSelects()
      renderGames()
    },
    (err) => showBanner("Error leyendo equipos: " + err.message + ". Revisa las reglas de Firestore.")
  )

  onSnapshot(
    collection(db, "games"),
    (snap) => {
      games = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      renderGames()
    },
    (err) => showBanner("Error leyendo juegos: " + err.message + ". Revisa las reglas de Firestore.")
  )
}

initFirebase()
