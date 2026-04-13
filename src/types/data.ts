export interface SourceReference {
  label: string
  url: string
  note?: string
}

export type PressureBand = 'low' | 'steady' | 'elevated' | 'oversubscribed' | 'unknown'

export interface BallotSnapshot {
  sourceType: 'live_official' | 'archived_official' | 'unavailable'
  sourceLabel: string
  sourceUrl: string
  snapshotDate?: string
  avail: number | null
  applicant: number | null
  hasBallot: boolean
  ballot: string | null
  remark: string | null
  pressureRatio: number | null
  pressureBand: PressureBand
}

export interface SchoolProgrammes {
  moe: string[]
  alpDomain: string | null
  alpTitle: string | null
  llpDomain: string | null
  llpTitle: string | null
}

export interface SchoolLocation {
  lat: number
  lng: number
}

export interface School {
  id: string
  name: string
  planningArea: string | null
  zone: string | null
  type: string | null
  nature: string | null
  session: string | null
  website: string | null
  address: string | null
  postalCode: string | null
  phone: string | null
  email: string | null
  mrt: string | null
  bus: string | null
  sap: boolean | null
  autonomous: boolean | null
  gifted: boolean | null
  ip: boolean | null
  motherTongues: string[]
  programmes: SchoolProgrammes
  ballot: BallotSnapshot | null
  location: SchoolLocation | null
}

export interface DatasetMeta {
  generatedAt: string
  schoolCount: number
  withCoordinates: number
  withBallotData: number
  ballotSourceType: BallotSnapshot['sourceType']
  ballotSourceLabel: string
  ballotSourceUrl: string
  ballotSnapshotDate?: string
  sources: SourceReference[]
  methodologyNotes: string[]
  distancePriorityOrder: string[]
  registrationPhases: string[]
}
