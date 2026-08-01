export type Team = {
  id: number
  name: string
  abbreviation: string
  countryCode: string
  confederation: string
}

export type Stadium = {
  name: string
  city: string | null
  country: string | null
}

export type Shot = {
  id: number
  matchId: number
  teamId: number
  teamName: string
  teamAbbreviation: string
  playerId: number
  playerName: string
  playerShortName: string | null
  playerPosition: string | null
  playerJerseyNumber: string | null
  playerImageUrl: string | null
  isHome: boolean
  shotType: 'goal' | 'save' | 'miss' | 'block' | 'post' | string
  isGoal: boolean
  isPenalty: boolean
  situation: string | null
  bodyPart: string | null
  goalType: string | null
  xg: number | null
  xgot: number | null
  playerX: number | null
  playerY: number | null
  goalMouthX: number | null
  goalMouthY: number | null
  blockX: number | null
  blockY: number | null
  distanceMeters: number | null
  distanceYards: number | null
  distanceBand: string
  timeMinute: number | null
  addedTime: number | null
  timeSeconds: number | null
  matchLabel: string
  matchDate: string | null
  matchStage: string | null
  stadium: Stadium | null
}

export type Dataset = {
  generatedAt: string
  source: {
    name: string
    url: string
    season: number
    note: string
    playerImages?: {
      name: string
      url: string
      dataUrl: string
      matchedPlayers: number
      totalPlayers: number
      updatedAt: string
    }
  }
  pitch: {
    lengthMeters: number
    widthMeters: number
  }
  teams: Team[]
  shots: Shot[]
}

export type NationStats = {
  teamId: number
  teamName: string
  teamAbbreviation: string
  countryCode: string
  shots: Shot[]
  count: number
  goalCount: number
  avgDistanceYards: number
  medianDistanceYards: number
  avgX: number
  avgY: number
  xg: number
  xgot: number
  band: string
}
