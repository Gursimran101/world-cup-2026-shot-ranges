import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const outFile = path.join(rootDir, 'public', 'data', 'worldcup-2026.json')
const API_BASE = 'https://api.balldontlie.io/fifa/worldcup/v1'
const PITCH_LENGTH_M = 105
const PITCH_WIDTH_M = 68
const METERS_TO_YARDS = 1.0936133
const REQUEST_DELAY_MS = Number(process.env.BDL_API_DELAY_MS ?? 6500)
let lastRequestAt = 0

function loadDotEnv() {
  const file = path.join(rootDir, '.env.local')
  if (!existsSync(file)) return

  return readFile(file, 'utf8').then((raw) => {
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index === -1) continue
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
      if (key && !process.env[key]) process.env[key] = value
    }
  })
}

function addArrayParam(params, key, values) {
  for (const value of values) params.append(key, String(value))
}

async function apiGet(endpoint, params = {}) {
  const elapsed = Date.now() - lastRequestAt
  if (lastRequestAt && elapsed < REQUEST_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS - elapsed))
  }

  const url = new URL(`${API_BASE}${endpoint}`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      addArrayParam(url.searchParams, key, value)
    } else {
      url.searchParams.set(key, String(value))
    }
  }

  let response
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch(url, {
      headers: {
        Authorization: process.env.BDL_FIFA_API_KEY,
      },
    })
    lastRequestAt = Date.now()

    if (response.status !== 429) break

    const retryAfter = Number(response.headers.get('retry-after') ?? 0)
    const waitMs = retryAfter > 0 ? retryAfter * 1000 : REQUEST_DELAY_MS * (attempt + 1)
    console.log(`Rate limited on ${endpoint}; waiting ${Math.ceil(waitMs / 1000)}s...`)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }

  if (!response?.ok) {
    const body = await response.text()
    throw new Error(`${endpoint} failed with ${response.status}: ${body}`)
  }

  return response.json()
}

async function fetchPaged(endpoint, params = {}, label = endpoint) {
  const rows = []
  let cursor
  const seenCursors = new Set()
  let pageCount = 0

  while (true) {
    const page = await apiGet(endpoint, { ...params, per_page: 100, cursor })
    rows.push(...(page.data ?? []))
    pageCount += 1
    console.log(`  ${label}: page ${pageCount}, ${rows.length} rows`)

    if (pageCount > 250) {
      throw new Error(`${label} exceeded 250 pages; stopping to avoid an unbounded cursor loop.`)
    }

    const next = page.meta?.next_cursor

    if (!next || seenCursors.has(next)) break
    seenCursors.add(next)
    cursor = next
  }

  return rows
}

function chunks(values, size) {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function isPenalty(shot) {
  return shot.situation === 'penalty' || shot.goal_type === 'penalty'
}

function shotDistance(playerX, playerY) {
  if (typeof playerX !== 'number' || typeof playerY !== 'number') {
    return { meters: null, yards: null }
  }

  const dx = (playerX / 100) * PITCH_LENGTH_M
  const dy = ((playerY - 50) / 100) * PITCH_WIDTH_M
  const meters = Math.sqrt(dx * dx + dy * dy)

  return {
    meters: Number(meters.toFixed(2)),
    yards: Number((meters * METERS_TO_YARDS).toFixed(2)),
  }
}

function distanceBand(yards) {
  if (yards === null || Number.isNaN(yards)) return 'unknown'
  if (yards < 6) return '0-6 yd'
  if (yards < 12) return '6-12 yd'
  if (yards < 18) return '12-18 yd'
  if (yards < 24) return '18-24 yd'
  return '24+ yd'
}

function slimMatch(match) {
  return {
    id: match.id,
    matchNumber: match.match_number,
    datetime: match.datetime,
    status: match.status,
    stage: match.stage?.name ?? null,
    group: match.group?.name ?? null,
    stadium: match.stadium
      ? {
          name: match.stadium.name,
          city: match.stadium.city,
          country: match.stadium.country,
        }
      : null,
    homeTeamId: match.home_team?.id ?? null,
    awayTeamId: match.away_team?.id ?? null,
    homeScore: match.home_score,
    awayScore: match.away_score,
    homePenaltyScore: match.home_score_penalties,
    awayPenaltyScore: match.away_score_penalties,
  }
}

function slimTeam(team) {
  return {
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    countryCode: team.country_code,
    confederation: team.confederation,
  }
}

function slimPlayer(rosterRow) {
  const player = rosterRow.player
  return {
    id: player.id,
    teamId: rosterRow.team_id,
    name: player.name,
    shortName: player.short_name,
    position: player.position ?? rosterRow.position ?? null,
    jerseyNumber: player.jersey_number ?? null,
    countryCode: player.country_code ?? null,
    imageUrl: null,
  }
}

async function main() {
  await loadDotEnv()

  if (!process.env.BDL_FIFA_API_KEY) {
    throw new Error('Missing BDL_FIFA_API_KEY. Add it to .env.local or export it before running.')
  }

  console.log('Fetching 2026 teams...')
  const teams = await fetchPaged('/teams', { 'seasons[]': [2026] }, 'teams')

  console.log('Fetching 2026 matches...')
  const matches = await fetchPaged('/matches', { 'seasons[]': [2026] }, 'matches')
  const completedMatches = matches.filter((match) => match.status === 'completed')

  console.log('Fetching 2026 rosters...')
  const rosters = await fetchPaged('/rosters', { 'seasons[]': [2026] }, 'rosters')

  console.log(`Fetching shots for ${completedMatches.length} completed matches...`)
  const shots = []
  const matchIdChunks = chunks(
    completedMatches.map((match) => match.id),
    12,
  )

  for (const [index, matchIds] of matchIdChunks.entries()) {
    const rows = await fetchPaged(
      '/match_shots',
      {
        'match_ids[]': matchIds,
      },
      `shots ${index + 1}/${matchIdChunks.length}`,
    )
    shots.push(...rows)
  }

  const teamsById = new Map(teams.map((team) => [team.id, slimTeam(team)]))
  const matchesById = new Map(completedMatches.map((match) => [match.id, slimMatch(match)]))
  const playersById = new Map()
  for (const row of rosters) {
    playersById.set(row.player.id, slimPlayer(row))
  }

  const normalizedShots = shots
    .filter((shot) => matchesById.has(shot.match_id))
    .map((shot) => {
      const distance = shotDistance(shot.player_x, shot.player_y)
      const player = playersById.get(shot.player_id) ?? {
        id: shot.player_id,
        teamId: shot.team_id,
        name: `Player ${shot.player_id}`,
        shortName: null,
        position: null,
        jerseyNumber: null,
        imageUrl: null,
      }
      const team = teamsById.get(shot.team_id)
      const match = matchesById.get(shot.match_id)

      return {
        id: shot.id,
        matchId: shot.match_id,
        teamId: shot.team_id,
        teamName: team?.name ?? `Team ${shot.team_id}`,
        teamAbbreviation: team?.abbreviation ?? String(shot.team_id),
        playerId: shot.player_id,
        playerName: player.name,
        playerShortName: player.shortName,
        playerPosition: player.position,
        playerJerseyNumber: player.jerseyNumber,
        playerImageUrl: player.imageUrl,
        isHome: shot.is_home,
        shotType: shot.shot_type,
        isGoal: shot.shot_type === 'goal',
        isPenalty: isPenalty(shot),
        situation: shot.situation,
        bodyPart: shot.body_part,
        goalType: shot.goal_type,
        xg: shot.xg,
        xgot: shot.xgot,
        playerX: shot.player_x,
        playerY: shot.player_y,
        goalMouthX: shot.goal_mouth_x,
        goalMouthY: shot.goal_mouth_y,
        blockX: shot.block_x,
        blockY: shot.block_y,
        distanceMeters: distance.meters,
        distanceYards: distance.yards,
        distanceBand: distanceBand(distance.yards),
        timeMinute: shot.time_minute,
        addedTime: shot.added_time,
        timeSeconds: shot.time_seconds,
        matchLabel: match
          ? `${teamsById.get(match.homeTeamId)?.abbreviation ?? 'TBD'} ${match.homeScore ?? '-'}-${match.awayScore ?? '-'} ${teamsById.get(match.awayTeamId)?.abbreviation ?? 'TBD'}`
          : `Match ${shot.match_id}`,
        matchDate: match?.datetime ?? null,
        matchStage: match?.stage ?? null,
        stadium: match?.stadium ?? null,
      }
    })
    .sort((a, b) => {
      if (a.matchDate !== b.matchDate) return String(a.matchDate).localeCompare(String(b.matchDate))
      return (a.timeSeconds ?? 0) - (b.timeSeconds ?? 0)
    })

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      name: 'BALLDONTLIE FIFA World Cup API',
      url: 'https://www.balldontlie.io/openapi/fifa.yml',
      season: 2026,
      note: 'Distances are computed from API shot coordinates using a 105m x 68m pitch and the goal center at x=0, y=50.',
    },
    pitch: {
      lengthMeters: PITCH_LENGTH_M,
      widthMeters: PITCH_WIDTH_M,
    },
    teams: [...teamsById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    matches: [...matchesById.values()].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime))),
    players: [...playersById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    shots: normalizedShots,
  }

  await mkdir(path.dirname(outFile), { recursive: true })
  await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`)

  const goalCount = normalizedShots.filter((shot) => shot.isGoal).length
  console.log(`Wrote ${normalizedShots.length} shots and ${goalCount} goals to ${path.relative(rootDir, outFile)}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
