import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const DATA_GOV_API_BASE = 'https://data.gov.sg/api/action/datastore_search'
const DATA_GOV_PAGE_SIZE = 1000

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'public', 'data')
const schoolsOutputPath = path.join(outputDir, 'schools.json')
const metaOutputPath = path.join(outputDir, 'meta.json')

const DATASETS = {
  generalInfo: {
    id: 'd_688b934f82c1059ed0a6993d2a829089',
    url: 'https://data.gov.sg/datasets/d_688b934f82c1059ed0a6993d2a829089/view',
    type: 'table',
  },
  moeProgrammes: {
    id: 'd_b0697d22a7837a4eddf72efb66a36fc2',
    url: 'https://data.gov.sg/datasets/d_b0697d22a7837a4eddf72efb66a36fc2/view',
    type: 'table',
  },
  distinctiveProgrammes: {
    id: 'd_db1faeea02c646fa3abccfa5aba99214',
    url: 'https://data.gov.sg/datasets/d_db1faeea02c646fa3abccfa5aba99214/view',
    type: 'table',
  },
}

const BALLOT_ENDPOINTS = [
  {
    sourceType: 'live_official',
    sourceLabel: 'Official MOE vacancies and balloting API',
    sourceUrl: 'https://www.moe.gov.sg/api/v1/vacanciesAndBalloting/getAllResult',
    snapshotDate: undefined,
  },
  {
    sourceType: 'archived_official',
    sourceLabel: 'Official MOE vacancies and balloting API archived by the Wayback Machine',
    sourceUrl:
      'https://web.archive.org/web/20220630151330if_/https://www.moe.gov.sg/api/v1/vacanciesAndBalloting/getAllResult',
    snapshotDate: '2022-06-30',
  },
]

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function cleanValue(value) {
  if (value === null || value === undefined) {
    return null
  }

  const text = String(value).trim()

  if (!text || /^na$/i.test(text) || /^n\/a$/i.test(text) || /^nil$/i.test(text)) {
    return null
  }

  return text
}

function parseInteger(value) {
  const text = cleanValue(value)

  if (!text) {
    return null
  }

  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeName(name) {
  return String(name)
    .toUpperCase()
    .replace(/&/g, 'AND')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toSlug(name) {
  return normalizeName(name).toLowerCase().replace(/\s+/g, '-')
}

function toBoolean(value) {
  const text = cleanValue(value)

  if (text === 'Yes') {
    return true
  }

  if (text === 'No') {
    return false
  }

  return null
}

function compact(values) {
  return values.filter(Boolean)
}

async function fetchJson(url, init, retries = 5) {
  let attempt = 0

  while (true) {
    attempt += 1

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'user-agent': 'primary-school-visualization-build/1.0',
          accept: 'application/json,text/plain,*/*',
          ...(init?.headers ?? {}),
        },
      })

      if (response.status === 429 && attempt < retries) {
        const body = await response.text()
        const retryAfterSeconds = Number(response.headers.get('retry-after') ?? '0')
        const suggestedSeconds = Number(body.match(/try again in (\d+) seconds/i)?.[1] ?? '0')
        await sleep((retryAfterSeconds || suggestedSeconds || attempt * 10) * 1000)
        continue
      }

      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Request failed for ${url} with ${response.status}: ${body.slice(0, 180)}`)
      }

      return await response.json()
    } catch (error) {
      if (attempt >= retries) {
        throw error
      }

      await sleep(attempt * 2000)
    }
  }
}

function derivePressureBand(applicant, avail, ballotText, remarkText) {
  if (applicant === null || avail === null || avail <= 0) {
    return 'unknown'
  }

  const ratio = applicant / avail
  const note = `${ballotText ?? ''} ${remarkText ?? ''}`.toLowerCase()

  if (applicant > avail || note.includes('ballot')) {
    return 'oversubscribed'
  }

  if (ratio >= 0.9) {
    return 'elevated'
  }

  if (ratio >= 0.6) {
    return 'steady'
  }

  return 'low'
}

async function fetchBallotData() {
  for (const endpoint of BALLOT_ENDPOINTS) {
    try {
      const payload = await fetchJson(endpoint.sourceUrl)
      const schoolList = payload?.[0]?.school_list

      if (!Array.isArray(schoolList)) {
        throw new Error('Unexpected ballot payload shape')
      }

      const ballotMap = new Map()

      for (const school of schoolList) {
        const applicant = parseInteger(school.applicant)
        const avail = parseInteger(school.avail)
        const ballotText = cleanValue(school.ballot)
        const remarkText = cleanValue(school.remark)

        ballotMap.set(normalizeName(school.title), {
          sourceType: endpoint.sourceType,
          sourceLabel: endpoint.sourceLabel,
          sourceUrl: endpoint.sourceUrl,
          snapshotDate: endpoint.snapshotDate,
          avail,
          applicant,
          hasBallot: Boolean(ballotText || remarkText || (avail !== null && applicant !== null && applicant > avail)),
          ballot: ballotText,
          remark: remarkText,
          pressureRatio: applicant !== null && avail ? applicant / avail : null,
          pressureBand: derivePressureBand(applicant, avail, ballotText, remarkText),
        })
      }

      return {
        sourceType: endpoint.sourceType,
        sourceLabel: endpoint.sourceLabel,
        sourceUrl: endpoint.sourceUrl,
        snapshotDate: endpoint.snapshotDate,
        ballotMap,
      }
    } catch (error) {
      console.warn(`Ballot source failed: ${endpoint.sourceUrl}`)
      console.warn(error instanceof Error ? error.message : error)
    }
  }

  return {
    sourceType: 'unavailable',
    sourceLabel: 'No machine-accessible official ballot endpoint was available during build.',
    sourceUrl: 'https://www.moe.gov.sg/primary/p1-registration/past-vacancies-and-balloting-data',
    snapshotDate: undefined,
    ballotMap: new Map(),
  }
}

async function loadExistingLocationCache() {
  try {
    const existing = JSON.parse(await readFile(schoolsOutputPath, 'utf8'))

    if (!Array.isArray(existing)) {
      return new Map()
    }

    return new Map(
      existing
        .filter((school) => school?.name && school?.location?.lat && school?.location?.lng)
        .map((school) => [normalizeName(school.name), school.location]),
    )
  } catch {
    return new Map()
  }
}

async function geocodeSchool(school, cache) {
  const cachedLocation = cache.get(normalizeName(school.name))

  if (cachedLocation) {
    return cachedLocation
  }

  const queries = compact([
    school.postalCode,
    school.address,
    school.name,
    compact([school.name, school.address]).join(' '),
  ])

  for (const query of queries) {
    const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`

    try {
      const payload = await fetchJson(url, undefined, 4)
      const result = payload?.results?.[0]

      if (result?.LATITUDE && result?.LONGITUDE) {
        const location = {
          lat: Number(result.LATITUDE),
          lng: Number(result.LONGITUDE),
        }

        cache.set(normalizeName(school.name), location)
        await sleep(120)
        return location
      }
    } catch (error) {
      console.warn(`Geocode failed for ${school.name} using ${query}`)
      console.warn(error instanceof Error ? error.message : error)
    }
  }

  return null
}

async function extractTableDataset(dataset) {
  const records = []
  const limit = DATA_GOV_PAGE_SIZE

  for (let offset = 0; ; offset += limit) {
    const payload = await fetchJson(
      `${DATA_GOV_API_BASE}?resource_id=${dataset.id}&limit=${limit}&offset=${offset}`,
    )

    if (!payload?.success || payload?.result?.resource_id !== dataset.id) {
      throw new Error(`Unexpected dataset payload for ${dataset.id}`)
    }

    const pageRecords = Array.isArray(payload.result.records) ? payload.result.records : []

    records.push(
      ...pageRecords.map(({ _id, ...record }) => record),
    )

    if (pageRecords.length < limit) {
      return records
    }
  }
}

await mkdir(outputDir, { recursive: true })

console.log('Fetching official datasets...')

const ballotData = await fetchBallotData()
const locationCache = await loadExistingLocationCache()
const generalInfoRecords = await extractTableDataset(DATASETS.generalInfo)
const moeProgrammeRecords = await extractTableDataset(DATASETS.moeProgrammes)
const distinctiveProgrammeRecords = await extractTableDataset(DATASETS.distinctiveProgrammes)

const primarySchoolRecords = generalInfoRecords.filter(
  (record) => cleanValue(record.mainlevel_code) === 'PRIMARY',
)

const groupedMoeProgrammes = new Map()
for (const record of moeProgrammeRecords) {
  const key = normalizeName(record.school_name)
  const programme = cleanValue(record.moe_programme_desc)

  if (!programme) {
    continue
  }

  const current = groupedMoeProgrammes.get(key) ?? []
  current.push(programme)
  groupedMoeProgrammes.set(key, current)
}

const groupedDistinctiveProgrammes = new Map()
for (const record of distinctiveProgrammeRecords) {
  groupedDistinctiveProgrammes.set(normalizeName(record.school_name), {
    alpDomain: cleanValue(record.alp_domain),
    alpTitle: cleanValue(record.alp_title),
    llpDomain: cleanValue(record.llp_domain1),
    llpTitle: cleanValue(record.llp_title),
  })
}

const schools = []

for (const record of primarySchoolRecords) {
  const name = cleanValue(record.school_name)

  if (!name) {
    continue
  }

  const key = normalizeName(name)
  const location = await geocodeSchool(
    {
      name,
      postalCode: cleanValue(record.postal_code),
      address: cleanValue(record.address),
    },
    locationCache,
  )

  schools.push({
    id: toSlug(name),
    name,
    planningArea: cleanValue(record.dgp_code),
    zone: cleanValue(record.zone_code),
    type: cleanValue(record.type_code),
    nature: cleanValue(record.nature_code),
    session: cleanValue(record.session_code),
    website: cleanValue(record.url_address),
    address: cleanValue(record.address),
    postalCode: cleanValue(record.postal_code),
    phone: cleanValue(record.telephone_no),
    email: cleanValue(record.email_address),
    mrt: cleanValue(record.mrt_desc),
    bus: cleanValue(record.bus_desc),
    sap: toBoolean(record.sap_ind),
    autonomous: toBoolean(record.autonomous_ind),
    gifted: toBoolean(record.gifted_ind),
    ip: toBoolean(record.ip_ind),
    motherTongues: compact([
      cleanValue(record.mothertongue1_code),
      cleanValue(record.mothertongue2_code),
      cleanValue(record.mothertongue3_code),
    ]),
    programmes: {
      moe: [...new Set(groupedMoeProgrammes.get(key) ?? [])],
      ...(groupedDistinctiveProgrammes.get(key) ?? {
        alpDomain: null,
        alpTitle: null,
        llpDomain: null,
        llpTitle: null,
      }),
    },
    ballot: ballotData.ballotMap.get(key) ?? null,
    location,
  })
}

schools.sort((first, second) => first.name.localeCompare(second.name))

const meta = {
  generatedAt: new Date().toISOString(),
  schoolCount: schools.length,
  withCoordinates: schools.filter((school) => school.location).length,
  withBallotData: schools.filter((school) => school.ballot).length,
  ballotSourceType: ballotData.sourceType,
  ballotSourceLabel: ballotData.sourceLabel,
  ballotSourceUrl: ballotData.sourceUrl,
  ballotSnapshotDate: ballotData.snapshotDate,
  registrationPhases: ['Phase 1', 'Phase 2A', 'Phase 2B', 'Phase 2C', 'Phase 2C Supplementary'],
  distancePriorityOrder: [
    'Singapore Citizen within 1km',
    'Singapore Citizen between 1km and 2km',
    'Singapore Citizen outside 2km',
    'Permanent Resident within 1km',
    'Permanent Resident between 1km and 2km',
    'Permanent Resident outside 2km',
  ],
  methodologyNotes: [
    'Ballot pressure is shown as historical or latest-accessible official context, not a prediction of future phases.',
    'School profiles and programme details are extracted from the official MOE datasets published on data.gov.sg.',
    'Coordinates are derived from official school addresses using the public OneMap search API.',
    ballotData.snapshotDate
      ? `The ballot dataset used in this build is the latest machine-accessible official archived MOE snapshot from ${ballotData.snapshotDate}.`
      : 'The build tried the live MOE ballot endpoint first and fell back only if unavailable.',
  ],
  sources: [
    {
      label: 'MOE P1 registration overview',
      url: 'https://www.moe.gov.sg/primary/p1-registration',
    },
    {
      label: 'MOE distance priority rules',
      url: 'https://www.moe.gov.sg/primary/p1-registration/distance',
    },
    {
      label: 'MOE school directory collection on data.gov.sg',
      url: 'https://data.gov.sg/collections/457/view',
    },
    {
      label: 'General information of schools dataset',
      url: `https://data.gov.sg/datasets/${DATASETS.generalInfo.id}/view`,
    },
    {
      label: 'School distinctive programmes dataset',
      url: `https://data.gov.sg/datasets/${DATASETS.distinctiveProgrammes.id}/view`,
    },
    {
      label: 'MOE programmes dataset',
      url: `https://data.gov.sg/datasets/${DATASETS.moeProgrammes.id}/view`,
    },
    {
      label: ballotData.sourceLabel,
      url: ballotData.sourceUrl,
    },
    {
      label: 'OneMap search API',
      url: 'https://www.onemap.gov.sg/apidocs/apidocs',
    },
  ],
}

await writeFile(schoolsOutputPath, `${JSON.stringify(schools, null, 2)}\n`)
await writeFile(metaOutputPath, `${JSON.stringify(meta, null, 2)}\n`)

console.log(`Wrote ${schools.length} schools to ${path.relative(projectRoot, schoolsOutputPath)}`)
console.log(`Wrote metadata to ${path.relative(projectRoot, metaOutputPath)}`)
