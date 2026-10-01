/**
 * Build-time logo resolver, written in Effect so it shares the conventions
 * the provider adapters use: typed errors, schema decoding, and platform
 * services instead of ad-hoc promise handling.
 *
 * Downloads the machine-sourced logos into public/logos and verifies all
 * 10 symbols resolve before writing the manifest. SPY and QQQ are
 * hand-sourced issuer assets: verified on disk, never re-fetched.
 *
 * Run: bun scripts/resolve-logos.ts
 * Requires: TWELVEDATA_API_KEY in .env
 */
import { FileSystem, Path } from '@effect/platform'
import { BunContext, BunRuntime } from '@effect/platform-bun'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

/**
 * Twelve Data is rate limited; pace requests so a full run succeeds.
 * (Effect.schedule returns a repetition count rather than the value, so
 * pacing is a delay.)
 */
const RequestDelay = Duration.seconds(8)

const CoingeckoIds: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
}

const Symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA', 'BTC', 'ETH']

/**
 * Hand-sourced assets: kept because the machine source has no usable logo
 * (SPY, QQQ) or returns a worse one than the curated file (META). Verified
 * on disk, never re-fetched.
 */
const HandSourced = ['spy', 'qqq', 'meta']

/** Filesystem paths for the resolver; public paths for the manifest. */
const LogoDir = 'public/logos'
const publicUrl = (file: string): string => `/logos/${file}`

class LogoUnavailable extends Schema.TaggedError<LogoUnavailable>()(
  'LogoUnavailable',
  { symbol: Schema.String, reason: Schema.String },
) {}

class LogoSourceError extends Schema.TaggedError<LogoSourceError>()(
  'LogoSourceError',
  { symbol: Schema.String, detail: Schema.String },
) {}

const TwelveDataLogoUrl = Schema.Struct({
  url: Schema.String,
  message: Schema.optional(Schema.String),
})

const CoinGeckoMarkets = Schema.Array(Schema.Struct({ image: Schema.String }))

const fetchResponse = (url: string, symbol: string) =>
  Effect.tryPromise({
    try: () => fetch(url, { redirect: 'follow' }),
    catch: (e) => new LogoSourceError({ symbol, detail: String(e) }),
  }).pipe(
    Effect.flatMap((res) =>
      res.ok
        ? Effect.succeed(res)
        : Effect.fail(
            new LogoSourceError({ symbol, detail: `HTTP ${res.status}` }),
          ),
    ),
  )

const fetchJson = (url: string, symbol: string) =>
  fetchResponse(url, symbol).pipe(
    Effect.flatMap((res) =>
      Effect.tryPromise({
        try: () => res.json(),
        catch: (e) => new LogoSourceError({ symbol, detail: String(e) }),
      }),
    ),
    Effect.map((json) => json as unknown),
  )

const decodeOrFail = <A>(
  symbol: string,
  json: unknown,
  schema: Schema.Schema<A>,
): Effect.Effect<A, LogoSourceError> =>
  Effect.gen(function* () {
    const decoded = Schema.decodeUnknownEither(schema, { errors: 'all' })(json)
    if (decoded._tag === 'Left') {
      return yield* new LogoSourceError({
        symbol,
        detail: decoded.left.message,
      })
    }
    return decoded.right
  })

const resolveUrl = (symbol: string) =>
  Effect.gen(function* () {
    const coinId = CoingeckoIds[symbol]
    if (coinId) {
      const json = yield* fetchJson(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinId}`,
        symbol,
      )
      const markets = yield* decodeOrFail(symbol, json, CoinGeckoMarkets)
      const image = markets[0]?.image
      if (!image) {
        return yield* new LogoUnavailable({ symbol, reason: 'no image' })
      }
      return image
    }

    const key = process.env.TWELVEDATA_API_KEY
    if (!key) {
      return yield* new LogoUnavailable({
        symbol,
        reason: 'TWELVEDATA_API_KEY not set',
      })
    }
    const json = yield* fetchJson(
      `https://api.twelvedata.com/logo?symbol=${symbol}&apikey=${key}`,
      symbol,
    )
    const body = yield* decodeOrFail(symbol, json, TwelveDataLogoUrl)
    if (body.message !== undefined) {
      return yield* new LogoUnavailable({ symbol, reason: body.message })
    }
    // Twelve Data returns an empty string when it has no logo.
    if (body.url === '') {
      return yield* new LogoUnavailable({ symbol, reason: 'empty url' })
    }
    return body.url
  })

/**
 * Twelve Data serves JPEGs from .png-looking paths, so trust the
 * content-type over the URL and only fall back to the extension.
 */
const extensionFor = (contentType: string, url: string): string => {
  if (contentType.includes('svg')) return 'svg'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  if (contentType.includes('png')) return 'png'
  if (url.includes('.svg')) return 'svg'
  if (url.includes('.webp')) return 'webp'
  return 'png'
}

const download = (symbol: string, url: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const res = yield* fetchResponse(url, symbol)
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      return yield* new LogoSourceError({
        symbol,
        detail: `not an image: ${contentType}`,
      })
    }
    const path = yield* Path.Path
    const file = `${symbol.toLowerCase()}.${extensionFor(contentType, url)}`
    const dest = path.join(LogoDir, file)
    // Never clobber an existing file: re-running the script is safe and
    // never overwrites a hand-curated logo.
    if (yield* fs.exists(dest)) {
      return yield* new LogoUnavailable({
        symbol,
        reason: `${file} already exists; delete it to re-download`,
      })
    }
    const bytes = yield* Effect.tryPromise({
      try: () => res.arrayBuffer(),
      catch: (e) => new LogoSourceError({ symbol, detail: String(e) }),
    })
    yield* fs.writeFile(dest, new Uint8Array(bytes))
    return publicUrl(file)
  })

/** Every `<id>.<ext>` already in public/logos, mapped to its public URL. */
const existingLogoUrls = () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const entries = yield* fs.readDirectory(LogoDir)
    const found: Record<string, string> = {}
    for (const file of entries) {
      if (file === 'manifest.json') continue
      const id = file.split('.')[0]
      if (!id) continue
      found[id] = publicUrl(file)
    }
    return found
  })

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  yield* fs.makeDirectory(LogoDir, { recursive: true })

  const resolved: Record<string, string> = {}
  const missing: Array<string> = []

  // Local files are authoritative: check disk before spending a request, so
  // re-running the script is cheap and never re-downloads what it has.
  const onDisk = yield* existingLogoUrls()

  for (const symbol of Symbols) {
    const key = symbol.toLowerCase()
    const existing = onDisk[key]
    if (existing) {
      resolved[key] = existing
      console.log(`  ${symbol} -> ${existing} (on disk)`)
      continue
    }
    const outcome = yield* resolveUrl(symbol).pipe(
      Effect.flatMap((url) => download(symbol, url)),
      Effect.delay(RequestDelay),
      Effect.either,
    )
    if (outcome._tag === 'Right') {
      resolved[key] = outcome.right
      console.log(`  ${symbol} -> ${outcome.right}`)
    } else {
      const reason =
        outcome.left instanceof LogoUnavailable
          ? outcome.left.reason
          : outcome.left._tag === 'LogoSourceError'
            ? outcome.left.detail
            : 'unknown failure'
      missing.push(symbol)
      console.log(`  ${symbol} FAILED: ${reason}`)
    }
  }

  for (const id of HandSourced) {
    const filePath = onDisk[id]
    if (filePath) {
      missing.push(id.toUpperCase())
      console.log(`  ${id.toUpperCase()} FAILED: hand-sourced file not found`)
    } else {
      resolved[id] = filePath
      console.log(`  ${id.toUpperCase()} -> ${filePath} (hand-sourced)`)
    }
  }

  if (missing.length > 0) {
    console.error(`\nMissing logos: ${missing.join(', ')}`)
    console.error('Manifest not written: every symbol must have a logo.')
    return yield* new LogoUnavailable({
      symbol: missing.join(','),
      reason: 'incomplete',
    })
  }

  const ordered = Object.fromEntries(
    [...Object.entries(resolved)].sort(([a], [b]) => a.localeCompare(b)),
  )
  yield* fs.writeFileString(
    path.join(LogoDir, 'manifest.json'),
    `${JSON.stringify(ordered, null, 2)}\n`,
  )
  console.log(`\nWrote ${Object.keys(ordered).length} logos + manifest.json`)
})

void BunRuntime.runMain(
  program.pipe(
    Effect.tapError((e) => Effect.sync(() => console.error(`\n${e.message}`))),
    Effect.catchAll(() => Effect.sync(() => void (process.exitCode = 1))),
    Effect.provide(BunContext.layer),
  ),
)
