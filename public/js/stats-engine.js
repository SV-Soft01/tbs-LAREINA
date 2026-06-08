// Motor de estadísticas: calcula totales, promedios y tabla de posiciones
// a partir de los equipos (roster) y los juegos registrados.

// Campos estadísticos que se registran por jugador en cada juego.
export const STAT_KEYS = ["puntos", "rebotes", "asistencias", "robos", "tapones"]

export const STAT_LABELS = {
  jj: "Juegos Jugados",
  puntos: "Puntos",
  rebotes: "Rebotes",
  asistencias: "Asistencias",
  robos: "Robos",
  tapones: "Tapones",
}

// Crea un objeto vacío de acumulados para un jugador.
function emptyTotals() {
  return {
    jj: 0,
    puntos: 0,
    rebotes: 0,
    asistencias: 0,
    robos: 0,
    tapones: 0,
  }
}

// Devuelve un mapa playerId -> { ...info jugador, totales }
// a partir de la lista de equipos y juegos.
export function computePlayerStats(teams, games) {
  const players = {}

  // Inicializar todos los jugadores de todos los equipos.
  teams.forEach((team) => {
    ;(team.players || []).forEach((p) => {
      players[p.id] = {
        id: p.id,
        nombre: p.nombre,
        numero: p.numero ?? "",
        teamId: team.id,
        teamName: team.nombre,
        totals: emptyTotals(),
      }
    })
  })

  // Acumular estadísticas de cada juego.
  games.forEach((game) => {
    const allStats = [
      ...(game.statsLocal || []),
      ...(game.statsVisitante || []),
    ]
    allStats.forEach((line) => {
      const player = players[line.playerId]
      if (!player) return
      player.totals.jj += 1
      STAT_KEYS.forEach((k) => {
        player.totals[k] += Number(line[k]) || 0
      })
    })
  })

  return players
}

// Promedio seguro (evita división por cero).
export function avg(total, games) {
  if (!games) return 0
  return total / games
}

// Construye una lista ordenada de líderes para una estadística dada.
// mode: "total" | "promedio"
export function leaders(players, statKey, mode) {
  const arr = Object.values(players)
    .filter((p) => p.totals.jj > 0)
    .map((p) => {
      const total = p.totals[statKey]
      const value = mode === "promedio" ? avg(total, p.totals.jj) : total
      return { ...p, value }
    })
  arr.sort((a, b) => b.value - a.value)
  return arr
}

// Calcula la tabla de posiciones de los equipos a partir de los juegos.
export function computeStandings(teams, games) {
  const table = {}
  teams.forEach((t) => {
    table[t.id] = {
      id: t.id,
      nombre: t.nombre,
      jj: 0,
      ganados: 0,
      perdidos: 0,
      puntosFavor: 0,
      puntosContra: 0,
    }
  })

  games.forEach((game) => {
    const local = table[game.localId]
    const visitante = table[game.visitanteId]
    if (!local || !visitante) return

    const pl = Number(game.marcadorLocal) || 0
    const pv = Number(game.marcadorVisitante) || 0

    local.jj += 1
    visitante.jj += 1
    local.puntosFavor += pl
    local.puntosContra += pv
    visitante.puntosFavor += pv
    visitante.puntosContra += pl

    if (pl > pv) {
      local.ganados += 1
      visitante.perdidos += 1
    } else if (pv > pl) {
      visitante.ganados += 1
      local.perdidos += 1
    }
  })

  const arr = Object.values(table).map((t) => ({
    ...t,
    diff: t.puntosFavor - t.puntosContra,
    pct: t.jj ? t.ganados / t.jj : 0,
  }))

  arr.sort((a, b) => {
    if (b.ganados !== a.ganados) return b.ganados - a.ganados
    if (b.pct !== a.pct) return b.pct - a.pct
    return b.diff - a.diff
  })

  return arr
}

// Genera un id simple para jugadores.
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
