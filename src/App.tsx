import { useDeferredValue, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  formatDistance,
  formatNumber,
  formatPercent,
  pressureLabel,
  pressureTone,
  titleCase,
} from './lib/format'
import type { DatasetMeta, School } from './types/data'

type LoadState = 'loading' | 'ready' | 'error'

type AddressMatch = {
  label: string
  lat: number
  lng: number
}

type SchoolView = School & {
  distanceKm: number | null
}

const DEFAULT_ERROR = 'The explorer could not load its local data files.'

function getJsonUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(getJsonUrl(path))

  if (!response.ok) {
    throw new Error(`Request failed for ${path} with ${response.status}`)
  }

  return (await response.json()) as T
}

function haversineDistanceKm(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
) {
  const toRadians = (value: number) => (value * Math.PI) / 180
  const earthRadiusKm = 6371
  const deltaLat = toRadians(second.lat - first.lat)
  const deltaLng = toRadians(second.lng - first.lng)
  const lat1 = toRadians(first.lat)
  const lat2 = toRadians(second.lat)

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))
}

function matchesSearchTerm(school: School, searchTerm: string) {
  if (!searchTerm) {
    return true
  }

  const haystacks = [
    school.name,
    school.address,
    school.zone,
    school.planningArea,
    school.programmes.alpTitle,
    school.programmes.llpTitle,
    ...school.programmes.moe,
  ]

  return haystacks
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(searchTerm))
}

function getMapPoint(school: SchoolView, bounds: {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}) {
  if (!school.location) {
    return null
  }

  const width = 100
  const height = 70
  const lngRange = bounds.maxLng - bounds.minLng || 1
  const latRange = bounds.maxLat - bounds.minLat || 1
  const x = ((school.location.lng - bounds.minLng) / lngRange) * width
  const y = height - ((school.location.lat - bounds.minLat) / latRange) * height

  return { x, y }
}

function MapPanel(props: {
  schools: SchoolView[]
  selectedSchoolId: string | null
  compareIds: string[]
  addressMatch: AddressMatch | null
  onSelectSchool: (schoolId: string) => void
}) {
  const geoSchools = props.schools.filter((school) => school.location)

  if (!geoSchools.length) {
    return (
      <section className="panel panel-map">
        <div className="panel-heading">
          <h2>Map</h2>
          <p>School coordinates are unavailable in the current dataset build.</p>
        </div>
      </section>
    )
  }

  const latitudes = geoSchools.map((school) => school.location?.lat ?? 0)
  const longitudes = geoSchools.map((school) => school.location?.lng ?? 0)
  const bounds = {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes),
  }

  const addressPoint = props.addressMatch
    ? getMapPoint(
        {
          id: 'address-point',
          name: props.addressMatch.label,
          planningArea: null,
          zone: null,
          type: null,
          nature: null,
          session: null,
          website: null,
          address: null,
          postalCode: null,
          phone: null,
          email: null,
          mrt: null,
          bus: null,
          sap: null,
          autonomous: null,
          gifted: null,
          ip: null,
          motherTongues: [],
          programmes: { moe: [], alpDomain: null, alpTitle: null, llpDomain: null, llpTitle: null },
          ballot: null,
          location: { lat: props.addressMatch.lat, lng: props.addressMatch.lng },
          distanceKm: null,
        },
        bounds,
      )
    : null

  return (
    <section className="panel panel-map">
      <div className="panel-heading">
        <h2>Map</h2>
        <p>Relative positions are derived from OneMap coordinates.</p>
      </div>

      <svg className="school-map" viewBox="0 0 100 70" aria-label="School map">
        <defs>
          <linearGradient id="mapGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eff6ff" />
            <stop offset="100%" stopColor="#dbeafe" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="70" rx="6" fill="url(#mapGradient)" />
        <path
          d="M8 52 C18 30, 34 15, 48 18 S74 14, 92 30 L88 47 C80 58, 60 63, 44 59 S18 62, 8 52"
          fill="rgba(15, 23, 42, 0.08)"
          stroke="rgba(15, 23, 42, 0.14)"
          strokeWidth="0.6"
        />

        {geoSchools.map((school) => {
          const point = getMapPoint(school, bounds)

          if (!point) {
            return null
          }

          const isSelected = props.selectedSchoolId === school.id
          const isCompared = props.compareIds.includes(school.id)
          const tone = school.ballot ? pressureTone(school.ballot.pressureBand) : 'tone-neutral'

          return (
            <g key={school.id} className={`map-point ${tone}`} onClick={() => props.onSelectSchool(school.id)}>
              <circle
                cx={point.x}
                cy={point.y}
                r={isSelected ? 2.1 : isCompared ? 1.8 : 1.3}
                className={isSelected ? 'map-point-selected' : isCompared ? 'map-point-compare' : 'map-point-base'}
              />
            </g>
          )
        })}

        {addressPoint ? (
          <g className="map-address-point">
            <path
              d={`M ${addressPoint.x} ${addressPoint.y - 2.8} l 1.1 2.2 l 2.4 0.4 l -1.8 1.6 l 0.4 2.5 l -2.1 -1.1 l -2.1 1.1 l 0.4 -2.5 l -1.8 -1.6 l 2.4 -0.4 z`}
            />
          </g>
        ) : null}
      </svg>

      <div className="map-legend">
        <span><i className="dot dot-low"></i>Lower pressure</span>
        <span><i className="dot dot-elevated"></i>Elevated pressure</span>
        <span><i className="dot dot-oversubscribed"></i>Oversubscribed snapshot</span>
        {props.addressMatch ? <span><i className="dot dot-address"></i>Searched address</span> : null}
      </div>
    </section>
  )
}

function App() {
  const [schools, setSchools] = useState<School[]>([])
  const [meta, setMeta] = useState<DatasetMeta | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [errorMessage, setErrorMessage] = useState(DEFAULT_ERROR)
  const [searchTerm, setSearchTerm] = useState('')
  const [zoneFilter, setZoneFilter] = useState('All zones')
  const [pressureFilter, setPressureFilter] = useState('all')
  const [sortBy, setSortBy] = useState('pressure')
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [addressQuery, setAddressQuery] = useState('')
  const [addressMatch, setAddressMatch] = useState<AddressMatch | null>(null)
  const [addressLoading, setAddressLoading] = useState(false)
  const [addressError, setAddressError] = useState<string | null>(null)
  const deferredSearchTerm = useDeferredValue(searchTerm.trim().toLowerCase())

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetchJson<School[]>('data/schools.json'),
      fetchJson<DatasetMeta>('data/meta.json'),
    ])
      .then(([schoolData, metaData]) => {
        if (cancelled) {
          return
        }

        setSchools(schoolData)
        setMeta(metaData)
        setSelectedSchoolId(schoolData[0]?.id ?? null)
        setLoadState('ready')
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return
        }

        setErrorMessage(error instanceof Error ? error.message : DEFAULT_ERROR)
        setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleAddressSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const query = addressQuery.trim()

    if (!query) {
      setAddressMatch(null)
      setAddressError(null)
      return
    }

    setAddressLoading(true)
    setAddressError(null)

    try {
      const response = await fetch(
        `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`,
      )

      if (!response.ok) {
        throw new Error(`OneMap search failed with ${response.status}`)
      }

      const payload = (await response.json()) as {
        results?: Array<{
          BUILDING?: string
          ADDRESS?: string
          LATITUDE?: string
          LONGITUDE?: string
        }>
      }
      const firstResult = payload.results?.[0]

      if (!firstResult?.LATITUDE || !firstResult?.LONGITUDE) {
        throw new Error('OneMap returned no address match for this search.')
      }

      setAddressMatch({
        label: firstResult.BUILDING || firstResult.ADDRESS || query,
        lat: Number(firstResult.LATITUDE),
        lng: Number(firstResult.LONGITUDE),
      })
      setSortBy('distance')
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : 'Address lookup failed.')
      setAddressMatch(null)
    } finally {
      setAddressLoading(false)
    }
  }

  function toggleCompare(schoolId: string) {
    setCompareIds((currentIds) => {
      if (currentIds.includes(schoolId)) {
        return currentIds.filter((currentId) => currentId !== schoolId)
      }

      return [...currentIds, schoolId].slice(-3)
    })
  }

  const schoolViews: SchoolView[] = schools.map((school) => ({
    ...school,
    distanceKm:
      addressMatch && school.location
        ? haversineDistanceKm(addressMatch, school.location)
        : null,
  }))

  const filteredSchools = schoolViews.filter((school) => {
    if (!matchesSearchTerm(school, deferredSearchTerm)) {
      return false
    }

    if (zoneFilter !== 'All zones' && school.zone !== zoneFilter) {
      return false
    }

    if (pressureFilter === 'oversubscribed' && school.ballot?.pressureBand !== 'oversubscribed') {
      return false
    }

    if (pressureFilter === 'elevated') {
      const band = school.ballot?.pressureBand

      if (band !== 'elevated' && band !== 'oversubscribed') {
        return false
      }
    }

    return true
  })

  const visibleSchools = [...filteredSchools].sort((first, second) => {
    if (sortBy === 'distance') {
      const firstDistance = first.distanceKm ?? Number.POSITIVE_INFINITY
      const secondDistance = second.distanceKm ?? Number.POSITIVE_INFINITY

      if (firstDistance !== secondDistance) {
        return firstDistance - secondDistance
      }
    }

    if (sortBy === 'name') {
      return first.name.localeCompare(second.name)
    }

    const firstRatio = first.ballot?.pressureRatio ?? -1
    const secondRatio = second.ballot?.pressureRatio ?? -1

    if (firstRatio !== secondRatio) {
      return secondRatio - firstRatio
    }

    return first.name.localeCompare(second.name)
  })

  const selectedSchool =
    visibleSchools.find((school) => school.id === selectedSchoolId) ?? visibleSchools[0] ?? null
  const comparedSchools = schoolViews.filter((school) => compareIds.includes(school.id))
  const uniqueZones = [
    'All zones',
    ...new Set(schools.map((school) => school.zone).filter((zone): zone is string => Boolean(zone))),
  ]
  const oversubscribedCount = schools.filter(
    (school) => school.ballot?.pressureBand === 'oversubscribed',
  ).length
  const elevatedCount = schools.filter((school) => {
    const band = school.ballot?.pressureBand
    return band === 'elevated' || band === 'oversubscribed'
  }).length
  const within1KmCount = visibleSchools.filter(
    (school) => school.distanceKm !== null && school.distanceKm <= 1,
  ).length
  const within2KmCount = visibleSchools.filter(
    (school) => school.distanceKm !== null && school.distanceKm <= 2,
  ).length

  if (loadState === 'loading') {
    return (
      <main className="page-shell loading-shell">
        <p>Loading official school data…</p>
      </main>
    )
  }

  if (loadState === 'error' || !meta) {
    return (
      <main className="page-shell loading-shell">
        <h1>Singapore Primary School Explorer</h1>
        <p>{errorMessage}</p>
      </main>
    )
  }

  return (
    <main className="page-shell">
      <section className="hero-section">
        <div>
          <p className="eyebrow">Singapore P1 context explorer</p>
          <h1>Search schools, compare locations, and read ballot pressure in context.</h1>
          <p className="hero-copy">
            This site combines official MOE school directory data, OneMap coordinates,
            and the latest machine-accessible official MOE vacancies and balloting snapshot available from this build environment.
          </p>
        </div>

        <div className="hero-callouts">
          <div className="metric-card">
            <span>Primary schools</span>
            <strong>{formatNumber(meta.schoolCount)}</strong>
          </div>
          <div className="metric-card">
            <span>Elevated snapshot pressure</span>
            <strong>{formatNumber(elevatedCount)}</strong>
          </div>
          <div className="metric-card">
            <span>Oversubscribed snapshot</span>
            <strong>{formatNumber(oversubscribedCount)}</strong>
          </div>
        </div>
      </section>

      <section className="panel panel-toolbar">
        <div className="toolbar-grid">
          <label className="field">
            <span>Search schools or programmes</span>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ai Tong, Bukit Timah, Chinese, robotics…"
            />
          </label>

          <form className="field address-field" onSubmit={handleAddressSubmit}>
            <span>Address lookup via OneMap</span>
            <div className="address-row">
              <input
                value={addressQuery}
                onChange={(event) => setAddressQuery(event.target.value)}
                placeholder="579646, Bright Hill Drive, or a home address"
              />
              <button type="submit" disabled={addressLoading}>
                {addressLoading ? 'Searching…' : 'Locate'}
              </button>
            </div>
          </form>

          <label className="field field-compact">
            <span>Zone</span>
            <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
              {uniqueZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>

          <label className="field field-compact">
            <span>Pressure view</span>
            <select value={pressureFilter} onChange={(event) => setPressureFilter(event.target.value)}>
              <option value="all">All schools</option>
              <option value="elevated">Elevated or oversubscribed</option>
              <option value="oversubscribed">Oversubscribed only</option>
            </select>
          </label>

          <label className="field field-compact">
            <span>Sort</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
              <option value="pressure">Pressure</option>
              <option value="distance">Distance</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <div className="toolbar-notes">
          <p>
            Snapshot source: <a href={meta.ballotSourceUrl}>{meta.ballotSourceLabel}</a>
          </p>
          {meta.ballotSnapshotDate ? (
            <p>
              Ballot reference year: <strong>{meta.ballotSnapshotDate.slice(0, 4)}</strong>.
            </p>
          ) : null}
          {addressMatch ? (
            <p>
              Address match: <strong>{addressMatch.label}</strong>. {within1KmCount} visible schools within 1km and {within2KmCount} within 2km.
            </p>
          ) : null}
          {addressError ? <p className="error-text">{addressError}</p> : null}
        </div>
      </section>

      <section className="panel panel-summary">
        <div className="summary-card">
          <span>Visible schools</span>
          <strong>{formatNumber(visibleSchools.length)}</strong>
          <p>After the current search and filter combination.</p>
        </div>
        <div className="summary-card">
          <span>Coordinates resolved</span>
          <strong>{formatPercent(meta.withCoordinates / meta.schoolCount)}</strong>
          <p>Built from OneMap geocoding of official school addresses.</p>
        </div>
        <div className="summary-card">
          <span>Ballot snapshot coverage</span>
          <strong>{formatPercent(meta.withBallotData / meta.schoolCount)}</strong>
          <p>
            Useful for historical competition context. The current build uses the official {meta.ballotSnapshotDate ? meta.ballotSnapshotDate.slice(0, 4) : 'archived'} snapshot, not a future prediction.
          </p>
        </div>
      </section>

      <section className="workspace-grid">
        <section className="panel panel-list">
          <div className="panel-heading">
            <h2>School explorer</h2>
            <p>{visibleSchools.length} schools match the current view.</p>
          </div>

          <div className="school-list">
            {visibleSchools.map((school) => {
              const pressure = school.ballot ? pressureLabel(school.ballot.pressureBand) : 'No snapshot'
              const selected = selectedSchool?.id === school.id
              const compared = compareIds.includes(school.id)

              return (
                <article
                  key={school.id}
                  className={`school-row ${selected ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSchoolId(school.id)}
                >
                  <div>
                    <div className="school-row-topline">
                      <h3>{school.name}</h3>
                      <span className={`pressure-pill ${pressureTone(school.ballot?.pressureBand ?? 'unknown')}`}>
                        {pressure}
                      </span>
                    </div>
                    <p>
                      {[school.planningArea, school.zone, school.type].filter(Boolean).join(' · ')}
                    </p>
                    <p className="school-row-subtle">
                      {school.distanceKm !== null ? `${formatDistance(school.distanceKm)} from address` : 'No address selected'}
                    </p>
                  </div>

                  <button
                    type="button"
                    className={`compare-button ${compared ? 'is-active' : ''}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleCompare(school.id)
                    }}
                  >
                    {compared ? 'Remove' : 'Compare'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section className="detail-stack">
          <section className="panel panel-detail">
            <div className="panel-heading">
              <h2>Selected school</h2>
              <p>Profile, contact details, and snapshot context.</p>
            </div>

            {selectedSchool ? (
              <div className="detail-body">
                <div className="detail-header">
                  <div>
                    <h3>{selectedSchool.name}</h3>
                    <p>{[selectedSchool.address, selectedSchool.postalCode].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={`pressure-pill large ${pressureTone(selectedSchool.ballot?.pressureBand ?? 'unknown')}`}>
                    {selectedSchool.ballot ? pressureLabel(selectedSchool.ballot.pressureBand) : 'No snapshot'}
                  </span>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <span>Planning area</span>
                    <strong>{titleCase(selectedSchool.planningArea) || 'Unavailable'}</strong>
                  </div>
                  <div className="detail-card">
                    <span>Zone</span>
                    <strong>{titleCase(selectedSchool.zone) || 'Unavailable'}</strong>
                  </div>
                  <div className="detail-card">
                    <span>Distance</span>
                    <strong>
                      {selectedSchool.distanceKm !== null
                        ? formatDistance(selectedSchool.distanceKm)
                        : 'Search an address'}
                    </strong>
                  </div>
                  <div className="detail-card">
                    <span>Session</span>
                    <strong>{titleCase(selectedSchool.session) || 'Unavailable'}</strong>
                  </div>
                </div>

                <div className="data-pairs">
                  <div>
                    <span>Snapshot applicants</span>
                    <strong>{formatNumber(selectedSchool.ballot?.applicant)}</strong>
                  </div>
                  <div>
                    <span>Snapshot places</span>
                    <strong>{formatNumber(selectedSchool.ballot?.avail)}</strong>
                  </div>
                  <div>
                    <span>Snapshot ratio</span>
                    <strong>{formatPercent(selectedSchool.ballot?.pressureRatio)}</strong>
                  </div>
                </div>

                {selectedSchool.ballot?.remark ? (
                  <p className="notice-text">MOE remark: {selectedSchool.ballot.remark}</p>
                ) : null}

                <div className="detail-sections">
                  <div>
                    <h4>Contact</h4>
                    <p>{selectedSchool.phone || 'Phone unavailable'}</p>
                    <p>{selectedSchool.email || 'Email unavailable'}</p>
                    {selectedSchool.website ? (
                      <p>
                        <a href={selectedSchool.website}>School website</a>
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <h4>Access</h4>
                    <p>{selectedSchool.mrt || 'MRT details unavailable'}</p>
                    <p>{selectedSchool.bus || 'Bus details unavailable'}</p>
                  </div>

                  <div>
                    <h4>Programmes</h4>
                    <p>{selectedSchool.programmes.alpTitle || 'ALP details unavailable'}</p>
                    <p>{selectedSchool.programmes.llpTitle || 'LLP details unavailable'}</p>
                    <p>
                      {selectedSchool.programmes.moe.length
                        ? selectedSchool.programmes.moe.join(', ')
                        : 'No MOE programme listed in the matched official dataset.'}
                    </p>
                  </div>
                </div>

                <div className="tag-row">
                  {selectedSchool.sap ? <span className="tag">SAP</span> : null}
                  {selectedSchool.autonomous ? <span className="tag">Autonomous</span> : null}
                  {selectedSchool.gifted ? <span className="tag">Gifted</span> : null}
                  {selectedSchool.ip ? <span className="tag">IP</span> : null}
                  {selectedSchool.motherTongues.map((language) => (
                    <span key={language} className="tag tag-soft">
                      {titleCase(language)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p>No school is selected.</p>
            )}
          </section>

          <MapPanel
            schools={visibleSchools}
            selectedSchoolId={selectedSchool?.id ?? null}
            compareIds={compareIds}
            addressMatch={addressMatch}
            onSelectSchool={setSelectedSchoolId}
          />
        </section>
      </section>

      <section className="panel panel-compare">
        <div className="panel-heading">
          <h2>Comparison tray</h2>
          <p>Select up to three schools to compare pressure, distance, and programmes.</p>
        </div>

        <div className="compare-grid">
          {comparedSchools.length ? (
            comparedSchools.map((school) => (
              <article key={school.id} className="compare-card">
                <div className="compare-card-header">
                  <h3>{school.name}</h3>
                  <button type="button" onClick={() => toggleCompare(school.id)}>
                    Remove
                  </button>
                </div>
                <p>{[titleCase(school.planningArea), titleCase(school.zone)].filter(Boolean).join(' · ')}</p>
                <dl>
                  <div>
                    <dt>Distance</dt>
                    <dd>{school.distanceKm !== null ? formatDistance(school.distanceKm) : 'Not calculated'}</dd>
                  </div>
                  <div>
                    <dt>Pressure</dt>
                    <dd>{school.ballot ? pressureLabel(school.ballot.pressureBand) : 'No snapshot'}</dd>
                  </div>
                  <div>
                    <dt>Applicants / places</dt>
                    <dd>
                      {formatNumber(school.ballot?.applicant)} / {formatNumber(school.ballot?.avail)}
                    </dd>
                  </div>
                  <div>
                    <dt>ALP</dt>
                    <dd>{school.programmes.alpTitle || 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt>LLP</dt>
                    <dd>{school.programmes.llpTitle || 'Unavailable'}</dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            <p className="compare-empty">No schools selected for comparison yet.</p>
          )}
        </div>
      </section>

      <section className="panel panel-methodology">
        <div className="panel-heading">
          <h2>How to read this</h2>
          <p>Use the explorer for context, not prediction.</p>
        </div>

        <div className="method-grid">
          <div>
            <h3>Registration phases</h3>
            <ul>
              {meta.registrationPhases.map((phase) => (
                <li key={phase}>{phase}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3>Distance priority</h3>
            <ol>
              {meta.distancePriorityOrder.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
          </div>

          <div>
            <h3>Method notes</h3>
            <ul>
              {meta.methodologyNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="source-strip">
          {meta.sources.map((source) => (
            <a key={source.url} href={source.url}>
              {source.label}
            </a>
          ))}
        </div>
      </section>
    </main>
  )
}

export default App
