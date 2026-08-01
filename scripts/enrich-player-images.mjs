import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(scriptDir, '..')
const dataFile = path.join(rootDir, 'public', 'data', 'worldcup-2026.json')

const GUARDIAN_GUIDE_URL =
  'https://www.theguardian.com/football/ng-interactive/2026/jun/04/world-cup-2026-complete-player-guide'
const GUARDIAN_TEAMS_DATA_URL =
  'https://interactive.guim.co.uk/docsdata/1_ZAfmUkTZ4BvDgvhEGaEruakfu4aWIIjjzXaMAiT1yc.json'

const TEAM_NAME_ALIASES = new Map([
  ['bosnia herzegovina', 'bosnia and herzegovina'],
  ['cabo verde', 'cape verde'],
  ['turkiye', 'turkey'],
])

const PLAYER_NAME_ALIASES = new Map([
  ['homam al amin', ['homam ahmed']],
  ['ayoube amaimouni echghouyab', ['ayoube amaimouni']],
  ['louicius don deedson', ['louicius deedson']],
  ['mahmud abunada', ['mahmoud abunada']],
  ['mohamed naceur almanai', ['mohamed al mannai', 'mohamed almannai']],
  ['shahriar moghanlou', ['shahriar moghanloo']],
  ['mehdi ghayedi', ['mehdi ghaedi']],
  ['mousa tamari', ['musa al taamari', 'musa taamari']],
  ['odeh fakhoury', ['odeh al fakhouri', 'odeh fakhouri']],
  ['jonas adjei adjetey', ['jonas adjetey']],
  ['abdul fatawu issahaku', ['abdul fatawu']],
  ['azizbek amanov', ['azizbek amonov']],
  ['tony ralston', ['anthony ralston']],
  ['sebastian tounekti', ['sebastien tounekti']],
  ['meschak elia', ['meschack elia']],
  ['rami rabia', ['ramy rabia']],
])

const CHARACTER_REPLACEMENTS = new Map([
  ['\u0131', 'i'],
  ['\u0130', 'i'],
  ['\u0142', 'l'],
  ['\u0141', 'l'],
  ['\u00f8', 'o'],
  ['\u00d8', 'o'],
  ['\u0111', 'd'],
  ['\u0110', 'd'],
  ['\u00f0', 'd'],
  ['\u00d0', 'd'],
  ['\u00fe', 'th'],
  ['\u00de', 'th'],
  ['\u00e6', 'ae'],
  ['\u00c6', 'ae'],
  ['\u0153', 'oe'],
  ['\u0152', 'oe'],
  ['\u00df', 'ss'],
])

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${url} failed with ${response.status}: ${body}`)
  }

  return response.json()
}

function foldCharacters(value) {
  return Array.from(String(value))
    .map((character) => CHARACTER_REPLACEMENTS.get(character) ?? character)
    .join('')
}

function normalize(value = '') {
  return foldCharacters(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\u2018\u2019\u201c\u201d"'`\u00b4]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function quotedAliases(value = '') {
  return Array.from(String(value).matchAll(/[\u2018\u2019"'`\u201c\u201d]([^\u2018\u2019"'`\u201c\u201d]+)[\u2018\u2019"'`\u201c\u201d]/g))
    .map((match) => normalize(match[1]))
    .filter(Boolean)
}

function nameVariants(value) {
  const normalized = normalize(value)
  const variants = new Set()
  if (!normalized) return variants

  variants.add(normalized)

  const tokens = normalized.split(' ').filter(Boolean)
  if (tokens.length > 1) {
    variants.add(tokens.slice().sort().join(' '))
    variants.add(`${tokens[0]} ${tokens.at(-1)}`)
    variants.add(`${tokens[0][0]} ${tokens.at(-1)}`)
    variants.add(tokens[0])
    variants.add(tokens.at(-1))
  }

  if (tokens.length > 2) {
    variants.add(`${tokens[0]} ${tokens[1]}`)
  }

  for (const alias of quotedAliases(value)) {
    variants.add(alias)
    if (tokens.at(-1)) variants.add(`${alias} ${tokens.at(-1)}`)
  }

  return variants
}

function playerNameVariants(value) {
  const normalized = normalize(value)
  const variants = nameVariants(value)

  for (const alias of PLAYER_NAME_ALIASES.get(normalized) ?? []) {
    for (const variant of nameVariants(alias)) variants.add(variant)
  }

  return variants
}

function normalizedTeamName(teamName) {
  const normalized = normalize(teamName)
  return TEAM_NAME_ALIASES.get(normalized) ?? normalized
}

function normalizedPosition(position) {
  const normalized = normalize(position)
  if (!normalized) return null
  if (normalized === 'g' || normalized.includes('goalkeeper')) return 'goalkeeper'
  if (normalized === 'd' || normalized.includes('defender')) return 'defender'
  if (normalized === 'm' || normalized.includes('midfielder')) return 'midfielder'
  if (normalized === 'f' || normalized.includes('forward') || normalized.includes('winger')) return 'forward'
  return normalized
}

function chooseMatch(matches, shotOrPlayer) {
  const withImages = matches.filter((match) => match.imageUrl)
  const candidates = withImages.length ? withImages : matches
  if (candidates.length === 1) return candidates[0]

  const jerseyNumber = shotOrPlayer.playerJerseyNumber ?? shotOrPlayer.jerseyNumber
  if (jerseyNumber !== undefined && jerseyNumber !== null) {
    const jerseyMatches = candidates.filter((candidate) => candidate.number === String(jerseyNumber))
    if (jerseyMatches.length === 1) return jerseyMatches[0]
  }

  const position = normalizedPosition(shotOrPlayer.playerPosition ?? shotOrPlayer.position)
  if (position) {
    const positionMatches = candidates.filter((candidate) => normalizedPosition(candidate.position) === position)
    if (positionMatches.length === 1) return positionMatches[0]
  }

  return null
}

function levenshtein(left, right) {
  const rows = left.length + 1
  const columns = right.length + 1
  const matrix = Array.from({ length: rows }, () => Array(columns))

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row
  for (let column = 0; column < columns; column += 1) matrix[0][column] = column

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
  }

  return matrix[left.length][right.length]
}

function fuzzyThreshold(value) {
  if (value.length <= 7) return 1
  if (value.length <= 14) return 2
  return 3
}

function fuzzyMatch(candidates, variants, shotOrPlayer) {
  const scores = []

  for (const candidate of candidates) {
    let score = Infinity
    for (const variant of variants) {
      if (variant.length < 7) continue
      for (const candidateVariant of candidate.variants) {
        if (candidateVariant.length < 7) continue
        score = Math.min(score, levenshtein(variant, candidateVariant))
      }
    }

    if (score < Infinity) scores.push({ candidate, score })
  }

  scores.sort((left, right) => left.score - right.score)
  if (!scores.length) return null

  const bestScore = scores[0].score
  const tiedCandidates = scores.filter((score) => score.score === bestScore).map((score) => score.candidate)
  const threshold = Math.max(...[...variants].filter((variant) => variant.length >= 7).map(fuzzyThreshold), 0)

  if (bestScore > threshold) return null
  return chooseMatch(tiedCandidates, shotOrPlayer)
}

function createMatcher(guardianPlayers) {
  const byTeam = new Map()
  const globalByVariant = new Map()

  for (const player of guardianPlayers) {
    const teamPlayers = byTeam.get(player.teamAbbreviation) ?? []
    teamPlayers.push(player)
    byTeam.set(player.teamAbbreviation, teamPlayers)

    for (const variant of player.variants) {
      const matches = globalByVariant.get(variant) ?? []
      matches.push(player)
      globalByVariant.set(variant, matches)
    }
  }

  return (shotOrPlayer) => {
    const variants = playerNameVariants(shotOrPlayer.playerName ?? shotOrPlayer.name)
    const teamPlayers = byTeam.get(shotOrPlayer.teamAbbreviation) ?? []

    for (const variant of variants) {
      const match = chooseMatch(
        teamPlayers.filter((player) => player.variants.has(variant)),
        shotOrPlayer,
      )
      if (match) return match
    }

    for (const variant of variants) {
      if (variant.length < 4) continue
      const match = chooseMatch(globalByVariant.get(variant) ?? [], shotOrPlayer)
      if (match) return match
    }

    return fuzzyMatch(teamPlayers, variants, shotOrPlayer) ?? fuzzyMatch(guardianPlayers, variants, shotOrPlayer)
  }
}

async function loadGuardianPlayers(dataset) {
  const guardianIndex = await fetchJson(GUARDIAN_TEAMS_DATA_URL)
  const guardianTeams = new Map(guardianIndex.sheets.Teams.map((team) => [normalize(team.Team), team]))
  const guardianPlayers = []

  for (const team of dataset.teams) {
    const guardianTeam = guardianTeams.get(normalizedTeamName(team.name))

    if (!guardianTeam?.spreadsheet) {
      console.warn(`No Guardian team sheet found for ${team.abbreviation} ${team.name}`)
      continue
    }

    const teamDataUrl = `https://interactive.guim.co.uk/docsdata/${guardianTeam.spreadsheet}.json`
    const teamData = await fetchJson(teamDataUrl)

    for (const player of teamData.sheets.Players ?? []) {
      guardianPlayers.push({
        teamAbbreviation: team.abbreviation,
        teamName: team.name,
        guardianTeamName: guardianTeam.Team,
        name: player.name,
        variants: nameVariants(player.name),
        number: player.number ? String(player.number).trim() : null,
        position: player.position ?? null,
        imageUrl: typeof player.grid_image === 'string' && player.grid_image.startsWith('https://') ? player.grid_image : null,
      })
    }
  }

  return guardianPlayers
}

async function main() {
  const dataset = JSON.parse(await readFile(dataFile, 'utf8'))
  const teamsById = new Map(dataset.teams.map((team) => [team.id, team]))
  const guardianPlayers = await loadGuardianPlayers(dataset)
  const matchGuardianPlayer = createMatcher(guardianPlayers)

  let shotsWithImages = 0
  dataset.shots = dataset.shots.map((shot) => {
    const guardianPlayer = matchGuardianPlayer(shot)
    if (guardianPlayer?.imageUrl) shotsWithImages += 1
    return { ...shot, playerImageUrl: guardianPlayer?.imageUrl ?? null }
  })

  let rosterPlayersWithImages = 0
  dataset.players = dataset.players.map((player) => {
    const team = teamsById.get(player.teamId)
    const guardianPlayer = team
      ? matchGuardianPlayer({
          ...player,
          teamAbbreviation: team.abbreviation,
        })
      : null

    if (guardianPlayer?.imageUrl) rosterPlayersWithImages += 1
    return { ...player, imageUrl: guardianPlayer?.imageUrl ?? null }
  })

  const uniqueShotPlayers = new Map(
    dataset.shots.map((shot) => [`${shot.teamAbbreviation}|${shot.playerName}`, shot]),
  )
  const matchedUniqueShotPlayers = [...uniqueShotPlayers.values()].filter((shot) => shot.playerImageUrl).length

  dataset.source = {
    ...dataset.source,
    playerImages: {
      name: 'The Guardian World Cup 2026 player guide',
      url: GUARDIAN_GUIDE_URL,
      dataUrl: GUARDIAN_TEAMS_DATA_URL,
      matchedPlayers: matchedUniqueShotPlayers,
      totalPlayers: uniqueShotPlayers.size,
      updatedAt: new Date().toISOString(),
    },
  }

  await writeFile(dataFile, `${JSON.stringify(dataset, null, 2)}\n`)

  console.log(
    `Added player images for ${matchedUniqueShotPlayers}/${uniqueShotPlayers.size} unique shot takers and ${shotsWithImages}/${dataset.shots.length} shot rows.`,
  )
  console.log(`Matched ${rosterPlayersWithImages}/${dataset.players.length} roster players.`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
