import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ChartNoAxesColumnIncreasing,
  Crosshair,
  Goal,
  Gauge,
  MapPinned,
  Ruler,
  Target,
  Trophy,
} from 'lucide-react'
import './App.css'
import type { Dataset, NationStats, Shot } from './types'

type Mode = 'goals' | 'shots'
type Unit = 'yards' | 'meters'

const PITCH_LENGTH = 105
const PITCH_WIDTH = 68
const METERS_TO_YARDS = 1.0936133
const DISTANCE_RINGS_YD = [6, 12, 18, 24, 30, 36]

function formatNumber(value: number | null | undefined, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
  return value.toFixed(decimals)
}

function formatDistance(value: number | null | undefined, unit: Unit) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A'
  if (unit === 'meters') return `${(value / METERS_TO_YARDS).toFixed(1)} m`
  return `${value.toFixed(1)} yd`
}

function formatMinute(shot: Shot) {
  if (shot.timeMinute === null) return '--'
  return shot.addedTime ? `${shot.timeMinute}+${shot.addedTime}'` : `${shot.timeMinute}'`
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function toTitle(value: string | null) {
  if (!value) return 'Unknown'
  return value
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function classifyDistance(yards: number) {
  if (yards < 6) return '0-6 yd'
  if (yards < 12) return '6-12 yd'
  if (yards < 18) return '12-18 yd'
  if (yards < 24) return '18-24 yd'
  return '24+ yd'
}

function bandClass(band: string) {
  return `band-${band.replace(/\W+/g, '-').toLowerCase()}`
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function svgX(value: number | null) {
  return ((value ?? 0) / 100) * PITCH_LENGTH
}

function svgY(value: number | null) {
  return ((value ?? 50) / 100) * PITCH_WIDTH
}

function nationMarkerPosition(nation: NationStats, index: number) {
  const laneCount = 8
  const lane = index % laneCount
  const row = Math.floor(index / laneCount)
  const x = Math.max(4.8, Math.min(45, nation.avgDistanceYards / METERS_TO_YARDS))
  const y = 7.8 + lane * 7.45 + (row % 2) * 2.45

  return { x, y }
}

function deriveNationStats(shots: Shot[]) {
  const byTeam = new Map<number, Shot[]>()

  for (const shot of shots) {
    if (shot.distanceYards === null || shot.playerX === null || shot.playerY === null) continue
    byTeam.set(shot.teamId, [...(byTeam.get(shot.teamId) ?? []), shot])
  }

  return [...byTeam.entries()]
    .map(([teamId, rows]) => {
      const distances = rows.map((shot) => shot.distanceYards ?? 0)
      const avgDistance = distances.reduce((sum, value) => sum + value, 0) / distances.length
      const avgX = rows.reduce((sum, shot) => sum + (shot.playerX ?? 0), 0) / rows.length
      const avgY = rows.reduce((sum, shot) => sum + (shot.playerY ?? 50), 0) / rows.length
      const first = rows[0]

      return {
        teamId,
        teamName: first.teamName,
        teamAbbreviation: first.teamAbbreviation,
        shots: rows.sort((a, b) => (a.timeSeconds ?? 0) - (b.timeSeconds ?? 0)),
        count: rows.length,
        goalCount: rows.filter((shot) => shot.isGoal).length,
        avgDistanceYards: avgDistance,
        medianDistanceYards: median(distances),
        avgX,
        avgY,
        xg: rows.reduce((sum, shot) => sum + (shot.xg ?? 0), 0),
        xgot: rows.reduce((sum, shot) => sum + (shot.xgot ?? 0), 0),
        band: classifyDistance(avgDistance),
      } satisfies NationStats
    })
    .sort((a, b) => b.avgDistanceYards - a.avgDistanceYards)
}

function useDataset() {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('./data/worldcup-2026.json')
      .then((response) => {
        if (!response.ok) throw new Error('Dataset not found. Run npm run data:fetch.')
        return response.json()
      })
      .then((json: Dataset) => setDataset(json))
      .catch((err: Error) => setError(err.message))
  }, [])

  return { dataset, error }
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="stat-tile">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  )
}

function PitchMap({
  shots,
  nations,
  selectedTeamId,
  onSelect,
}: {
  shots: Shot[]
  nations: NationStats[]
  selectedTeamId: number | null
  onSelect: (teamId: number) => void
}) {
  const goalShots = shots.filter((shot) => shot.isGoal)
  const visibleShots = shots.filter((shot) => shot.playerX !== null && shot.playerY !== null)
  const selectedNation = nations.find((nation) => nation.teamId === selectedTeamId)
  const plottedNations = [
    ...nations.filter((nation) => nation.teamId !== selectedTeamId),
    ...(selectedNation ? [selectedNation] : []),
  ]

  return (
    <svg className="pitch" viewBox="-3 -3 111 74" role="img" aria-label="World Cup 2026 shot range pitch">
      <defs>
        <clipPath id="pitch-clip">
          <rect x="0" y="0" width={PITCH_LENGTH} height={PITCH_WIDTH} rx="0" />
        </clipPath>
        <linearGradient id="pitch-grass" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#2e7a51" />
          <stop offset="55%" stopColor="#1f6b46" />
          <stop offset="100%" stopColor="#185238" />
        </linearGradient>
      </defs>

      <rect className="pitch-base" x="0" y="0" width={PITCH_LENGTH} height={PITCH_WIDTH} />
      <g className="mow-lines" clipPath="url(#pitch-clip)">
        {Array.from({ length: 8 }, (_, index) => (
          <rect key={index} x={index * 13.125} y="0" width="6.5625" height={PITCH_WIDTH} />
        ))}
      </g>

      <g className="pitch-lines">
        <rect x="0" y="0" width={PITCH_LENGTH} height={PITCH_WIDTH} />
        <line x1={PITCH_LENGTH / 2} y1="0" x2={PITCH_LENGTH / 2} y2={PITCH_WIDTH} />
        <circle cx={PITCH_LENGTH / 2} cy={PITCH_WIDTH / 2} r="9.15" />
        <rect x="0" y="13.84" width="16.5" height="40.32" />
        <rect x="0" y="24.84" width="5.5" height="18.32" />
        <path d="M 16.5 24.85 A 9.15 9.15 0 0 1 16.5 43.15" />
        <circle cx="11" cy="34" r="0.45" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" />
        <circle cx="94" cy="34" r="0.45" />
      </g>

      <g className="distance-rings" clipPath="url(#pitch-clip)">
        {DISTANCE_RINGS_YD.map((yards) => {
          const radius = yards / METERS_TO_YARDS
          return (
            <g key={yards}>
              <circle cx="0" cy="34" r={radius} />
              <text x={radius * 0.62 + 0.9} y={34 - radius * 0.72}>
                {yards} yd
              </text>
            </g>
          )
        })}
      </g>

      <g className="goal-lines" clipPath="url(#pitch-clip)">
        {goalShots.slice(0, 260).map((shot, index) => (
          <line
            key={shot.id}
            className="goal-trail"
            x1={svgX(shot.playerX)}
            y1={svgY(shot.playerY)}
            x2="0"
            y2={svgY(shot.goalMouthY)}
            style={{ '--delay': `${index * 24}ms` } as React.CSSProperties}
          />
        ))}
      </g>

      <g className="shot-dots" clipPath="url(#pitch-clip)">
        {visibleShots.map((shot, index) => (
          <circle
            key={shot.id}
            className={`shot-dot ${shot.isGoal ? 'is-goal' : ''}`}
            cx={svgX(shot.playerX)}
            cy={svgY(shot.playerY)}
            r={shot.isGoal ? 0.82 : 0.46}
            style={{ '--delay': `${Math.min(index, 320) * 12}ms` } as React.CSSProperties}
          >
            <title>
              {shot.teamAbbreviation} - {shot.playerName} - {formatDistance(shot.distanceYards, 'yards')}
            </title>
          </circle>
        ))}
      </g>

      <g className="nation-markers">
        {plottedNations.map((nation) => {
          const radius = Math.max(2.4, Math.min(4.9, 2.2 + Math.sqrt(nation.count) * 0.42))
          const markerIndex = nations.findIndex((row) => row.teamId === nation.teamId)
          const markerPosition = nationMarkerPosition(nation, markerIndex)

          return (
            <g
              key={nation.teamId}
              className={`nation-marker ${bandClass(nation.band)} ${selectedTeamId === nation.teamId ? 'selected' : ''}`}
              data-team-id={nation.teamId}
              aria-label={`${nation.teamName}: ${formatDistance(nation.avgDistanceYards, 'yards')} average`}
              transform={`translate(${markerPosition.x} ${markerPosition.y})`}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(nation.teamId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(nation.teamId)
              }}
            >
              <circle className="hit-area" r={radius + 2.6} />
              <circle className="marker-core" r={radius} />
              <text y="0.65">{nation.teamAbbreviation}</text>
              <title>
                {nation.teamName}: {formatDistance(nation.avgDistanceYards, 'yards')} average
              </title>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function Leaderboard({
  nations,
  selectedTeamId,
  unit,
  onSelect,
}: {
  nations: NationStats[]
  selectedTeamId: number | null
  unit: Unit
  onSelect: (teamId: number) => void
}) {
  return (
    <section className="leaderboard" aria-label="Nation ranking">
      <div className="section-heading">
        <ChartNoAxesColumnIncreasing size={18} />
        <h2>Nation Range</h2>
      </div>
      <div className="nation-list">
        {nations.map((nation, index) => (
          <button
            key={nation.teamId}
            type="button"
            className={selectedTeamId === nation.teamId ? 'active' : ''}
            onClick={() => onSelect(nation.teamId)}
          >
            <span className="rank">{index + 1}</span>
            <span className={`swatch ${bandClass(nation.band)}`} />
            <span className="nation-name">
              <strong>{nation.teamAbbreviation}</strong>
              <small>{nation.teamName}</small>
            </span>
            <span className="nation-distance">{formatDistance(nation.avgDistanceYards, unit)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function DetailPanel({
  nation,
  unit,
  mode,
}: {
  nation: NationStats | undefined
  unit: Unit
  mode: Mode
}) {
  if (!nation) {
    return (
      <aside className="detail-panel">
        <div className="section-heading">
          <MapPinned size={18} />
          <h2>Nation Detail</h2>
        </div>
      </aside>
    )
  }

  const goals = nation.shots.filter((shot) => shot.isGoal)
  const rows = mode === 'goals' ? goals : nation.shots
  const longest = rows.reduce<Shot | null>((best, shot) => {
    if (shot.distanceYards === null) return best
    if (!best || (best.distanceYards ?? 0) < shot.distanceYards) return shot
    return best
  }, null)

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <span className={`country-token ${bandClass(nation.band)}`}>{nation.teamAbbreviation}</span>
        <div>
          <h2>{nation.teamName}</h2>
          <p>{nation.band} average range</p>
        </div>
      </div>

      <div className="detail-metrics">
        <StatTile icon={<Ruler size={17} />} label="Average" value={formatDistance(nation.avgDistanceYards, unit)} />
        <StatTile icon={<Target size={17} />} label="Median" value={formatDistance(nation.medianDistanceYards, unit)} />
        <StatTile icon={<Goal size={17} />} label="Goals" value={String(nation.goalCount)} />
        <StatTile icon={<Crosshair size={17} />} label="xG" value={formatNumber(nation.xg, 2)} />
      </div>

      <div className="callout">
        <Gauge size={18} />
        <p>
          Ball speed is not included in the source data. Distances use the shot origin to the center of the goal.
        </p>
      </div>

      {longest && (
        <div className="longest-shot">
          <span>Longest {mode === 'goals' ? 'goal' : 'shot'}</span>
          <strong>
            {longest.playerName} - {formatDistance(longest.distanceYards, unit)}
          </strong>
        </div>
      )}

      <div className="shot-breakdown">
        {rows.slice(0, 24).map((shot) => (
          <article key={shot.id} className={shot.isGoal ? 'goal-row' : ''}>
            <div className="avatar">
              {shot.playerImageUrl ? <img src={shot.playerImageUrl} alt="" /> : <span>{initials(shot.playerName)}</span>}
            </div>
            <div className="shot-copy">
              <strong>{shot.playerName}</strong>
              <span>
                {formatMinute(shot)} - {shot.matchLabel} - {toTitle(shot.bodyPart)} - {toTitle(shot.situation)}
              </span>
            </div>
            <div className="shot-values">
              <strong>{formatDistance(shot.distanceYards, unit)}</strong>
              <span>{shot.isGoal ? 'Goal' : toTitle(shot.shotType)}</span>
            </div>
          </article>
        ))}
      </div>
    </aside>
  )
}

function App() {
  const { dataset, error } = useDataset()
  const [mode, setMode] = useState<Mode>('goals')
  const [includePenalties, setIncludePenalties] = useState(true)
  const [unit, setUnit] = useState<Unit>('yards')
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)

  const filteredShots = useMemo(() => {
    if (!dataset) return []
    return dataset.shots.filter((shot) => {
      if (mode === 'goals' && !shot.isGoal) return false
      if (!includePenalties && shot.isPenalty) return false
      return shot.distanceYards !== null && shot.playerX !== null && shot.playerY !== null
    })
  }, [dataset, includePenalties, mode])

  const nationStats = useMemo(() => deriveNationStats(filteredShots), [filteredShots])
  const selectedNation = nationStats.find((nation) => nation.teamId === selectedTeamId) ?? nationStats[0]

  useEffect(() => {
    if (!selectedTeamId && nationStats.length) {
      setSelectedTeamId(nationStats[0].teamId)
    }
  }, [nationStats, selectedTeamId])

  const goals = filteredShots.filter((shot) => shot.isGoal)
  const avgDistance =
    filteredShots.reduce((sum, shot) => sum + (shot.distanceYards ?? 0), 0) / Math.max(filteredShots.length, 1)
  const generated = dataset?.generatedAt
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(dataset.generatedAt))
    : null

  if (error) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <Trophy size={28} />
          <h1>Dataset Missing</h1>
          <p>{error}</p>
        </section>
      </main>
    )
  }

  if (!dataset) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <Activity size={28} />
          <h1>Loading World Cup shots</h1>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <span>World Cup 2026</span>
          <h1>Average Shot Range by Nation</h1>
        </div>
        <div className="controls" aria-label="Visualization controls">
          <div className="segmented">
            <button type="button" className={mode === 'goals' ? 'active' : ''} onClick={() => setMode('goals')}>
              <Goal size={16} />
              Goals
            </button>
            <button type="button" className={mode === 'shots' ? 'active' : ''} onClick={() => setMode('shots')}>
              <Target size={16} />
              Shots
            </button>
          </div>
          <button type="button" className="toggle" aria-pressed={includePenalties} onClick={() => setIncludePenalties((value) => !value)}>
            <Crosshair size={16} />
            {includePenalties ? 'Pens included' : 'Pens off'}
          </button>
          <button type="button" className="toggle" onClick={() => setUnit((value) => (value === 'yards' ? 'meters' : 'yards'))}>
            <Ruler size={16} />
            {unit === 'yards' ? 'Yards' : 'Meters'}
          </button>
        </div>
      </header>

      <section className="summary-strip" aria-label="Tournament summary">
        <StatTile icon={<Trophy size={17} />} label="Nations" value={String(nationStats.length)} />
        <StatTile icon={<Goal size={17} />} label="Goals" value={String(goals.length)} />
        <StatTile icon={<Target size={17} />} label={mode === 'goals' ? 'Goal Rows' : 'Shot Rows'} value={String(filteredShots.length)} />
        <StatTile icon={<Ruler size={17} />} label="Average" value={formatDistance(avgDistance, unit)} />
      </section>

      <section className="workspace">
        <section className="pitch-panel">
          <div className="section-heading pitch-title">
            <Gauge size={18} />
            <h2>{mode === 'goals' ? 'Goal Distance Map' : 'Shot Distance Map'}</h2>
          </div>
          <PitchMap shots={filteredShots} nations={nationStats} selectedTeamId={selectedNation?.teamId ?? null} onSelect={setSelectedTeamId} />
        </section>

        <Leaderboard nations={nationStats} selectedTeamId={selectedNation?.teamId ?? null} unit={unit} onSelect={setSelectedTeamId} />
        <DetailPanel nation={selectedNation} unit={unit} mode={mode} />
      </section>

      <footer>
        <span>Source: {dataset.source.name}</span>
        {generated && <span>Generated {generated}</span>}
      </footer>
    </main>
  )
}

export default App
