import * as HttpClient from '@effect/platform/HttpClient'
import * as HttpClientResponse from '@effect/platform/HttpClientResponse'
import * as FetchHttpClient from '@effect/platform/FetchHttpClient'
import * as MarketsSchema from '#/api/market-schema'
import * as Effect from 'effect/Effect'
import * as Either from 'effect/Either'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Duration from 'effect/Duration'
import { MarketProvider } from './market-provider'

/**
 * Alpha Vantage adapter for the MarketProvider boundary.
 *
 * Every Alpha Vantage-shaped concern (numbered metadata keys, nested
 * "Meta Data" blocks, the "5. adjusted close" field, free-tier error
 * payloads) is decoded here and mapped to domain types before leaving
 * this file. No raw provider shape escapes.
 *
 * Why weekly: the free tier blocks TIME_SERIES_DAILY_ADJUSTED and caps
 * TIME_SERIES_DAILY at 100 unadjusted days. TIME_SERIES_WEEKLY_ADJUSTED
 * is free and carries genuine split/dividend-adjusted closes, which is
 * what PricePoint.price requires.
 */

// --- Raw provider shapes (never leave this file) ---

const PriceSeries = <K extends string>(field: K) =>
  Schema.Record({
    key: Schema.String,
    value: Schema.Struct({ [field]: Schema.String }),
  })

const WeeklyAdjustedResponse = Schema.Struct({
  'Weekly Adjusted Time Series': PriceSeries('5. adjusted close'),
})

/**
 * Crypto has no adjusted weekly series on the free tier, so it uses the
 * unadjusted endpoint, whose series key is 'Weekly Time Series' (not the
 * 'Time Series (Digital Currency Weekly)' shape the digital-currency
 * endpoint uses).
 */
const CryptoWeeklyResponse = Schema.Struct({
  'Weekly Time Series': PriceSeries('4. close'),
})

const GlobalQuoteResponse = Schema.Struct({
  'Global Quote': Schema.Record({ key: Schema.String, value: Schema.String }),
})

// --- Universe ---

interface UniverseEntry {
  readonly id: string
  readonly symbol: string
  readonly name: string
  readonly category: string
}

const UNIVERSE: ReadonlyArray<UniverseEntry> = [
  {
    id: 'spy',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    category: 'ETF',
  },
  {
    id: 'qqq',
    symbol: 'QQQ',
    name: 'Invesco QQQ Trust',
    category: 'ETF',
  },
  { id: 'aapl', symbol: 'AAPL', name: 'Apple Inc.', category: 'Stock' },
  {
    id: 'msft',
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    category: 'Stock',
  },
  {
    id: 'nvda',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    category: 'Stock',
  },
  {
    id: 'amzn',
    symbol: 'AMZN',
    name: 'Amazon.com, Inc.',
    category: 'Stock',
  },
  {
    id: 'meta',
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    category: 'Stock',
  },
  { id: 'tsla', symbol: 'TSLA', name: 'Tesla, Inc.', category: 'Stock' },
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', category: 'Crypto' },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', category: 'Crypto' },
]

const CRYPTO_IDS: ReadonlySet<string> = new Set(['btc', 'eth'])

/**
 * Logos are resolved once at build time by scripts/resolve-logos.ts into
 * public/logos and committed, so no logo API is called at runtime.
 * SPY and QQQ are hand-sourced issuer assets.
 */
const LOGO_URLS: Record<string, string> = {
  spy: '/logos/spy.png',
  qqq: '/logos/qqq.webp',
  aapl: '/logos/aapl.jpg',
  msft: '/logos/msft.jpg',
  nvda: '/logos/nvda.jpg',
  amzn: '/logos/amzn.jpg',
  meta: '/logos/meta.jpg',
  tsla: '/logos/tsla.jpg',
  btc: '/logos/btc.png',
  eth: '/logos/eth.png',
}

// --- Fetch + decode ---

const BaseUrl = 'https://www.alphavantage.co/query'

const apiKey = (): string => process.env.ALPHAVANTAGE_API_KEY ?? ''

/**
 * Built once per layer so HttpClient never appears in the adapter's
 * requirements channel; the boundary exposes only domain types.
 */
const makeGetJson = (client: HttpClient.HttpClient) => {
  const retrying = client.pipe(
    HttpClient.filterStatusOk,
    HttpClient.retryTransient({
      times: 3,
      schedule: Schedule.exponential('1 second'),
    }),
  )

  return (
    symbol: string,
    params: Record<string, string>,
  ): Effect.Effect<unknown, MarketsSchema.MarketDataUnavailable> =>
    Effect.gen(function* () {
      const url = `${BaseUrl}?${new URLSearchParams({
        ...params,
        apikey: apiKey(),
      }).toString()}`
      const response = yield* retrying.get(url)
      // schemaJson decodes the whole response envelope, so reach into
      // `body` for the payload. A loose record is deliberate: provider
      // errors are inspected before any shaped decode happens.
      const { body } = yield* HttpClientResponse.schemaJson(
        Schema.Struct({
          body: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
        }),
      )(response)
      return body
    }).pipe(
      // Transport and decode failures are provider failures from the
      // domain's point of view; mapping them here stops HTTP internals
      // leaking past the adapter boundary.
      Effect.mapError(
        (cause) =>
          new MarketsSchema.MarketDataUnavailable({
            symbol,
            message: String(cause),
          }),
      ),
    )
}

/** Surfaces free-tier rate limits and premium walls as one domain error. */
const assertNotProviderError = (json: unknown, symbol: string) =>
  Effect.gen(function* () {
    const asRecord: Record<string, unknown> =
      typeof json === 'object' && json !== null
        ? (json as Record<string, unknown>)
        : {}
    const reason =
      asRecord['Note'] ?? asRecord['Information'] ?? asRecord['Error Message']
    if (typeof reason === 'string') {
      return yield* new MarketsSchema.MarketDataUnavailable({
        symbol,
        message: reason,
      })
    }
  })

const decodeWith = <A>(
  json: unknown,
  schema: Schema.Schema<A>,
): A | undefined =>
  Either.getOrUndefined(Schema.decodeUnknownEither(schema)(json))

// --- Mapping ---

const parsePrice = (raw: string): number | undefined => {
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : undefined
}

/** Provider series are newest-first; domain is ascending by date. */
const toPoints = (
  series: Readonly<Record<string, { price: string }>>,
): ReadonlyArray<MarketsSchema.PricePoint> =>
  Object.entries(series)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, entry]) => {
      const price = parsePrice(entry.price)
      return price === undefined ? [] : [{ date, price }]
    })

const PERIOD_YEARS: Record<MarketsSchema.MarketPeriod, number> = {
  '1Y': 1,
  '3Y': 3,
  '5Y': 5,
}

const sliceToPeriod = (
  points: ReadonlyArray<MarketsSchema.PricePoint>,
  period: MarketsSchema.MarketPeriod,
): ReadonlyArray<MarketsSchema.PricePoint> => {
  const cutoff = new Date()
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - PERIOD_YEARS[period])
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  return points.filter((p) => p.date >= cutoffIso)
}

// --- Layer ---

/** The free tier is 25 req/day, so a day-long TTL keeps 10 symbols safe. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000

/**
 * The free tier also allows roughly one request per second, so requests
 * are serialized and spaced rather than run concurrently.
 */
const MinRequestSpacing = Duration.seconds(1.25)

export const AlphaVantageMarketProviderLive = Layer.effect(
  MarketProvider,
  Effect.gen(function* () {
    const listCache = yield* Ref.make<
      { at: number; markets: ReadonlyArray<MarketsSchema.Market> } | undefined
    >(undefined)
    /**
     * Full weekly series per symbol, cached. Period slicing happens after
     * this, so switching 1Y/3Y/5Y costs no additional request.
     */
    const seriesCache = yield* Ref.make(
      new Map<
        string,
        {
          at: number
          points: ReadonlyArray<MarketsSchema.PricePoint>
        }
      >(),
    )
    const getJson = makeGetJson(yield* HttpClient.HttpClient)

    /** Spaced fetch: the provider rejects bursts above ~1 req/sec. */
    const requestJson = (
      symbol: string,
      params: Record<string, string>,
    ): Effect.Effect<unknown, MarketsSchema.MarketDataUnavailable> =>
      getJson(symbol, params).pipe(Effect.delay(MinRequestSpacing))

    const fetchMarkets: Effect.Effect<
      ReadonlyArray<MarketsSchema.Market>,
      MarketsSchema.MarketDataUnavailable
    > = Effect.forEach(
      UNIVERSE,
      (entry) =>
        Effect.gen(function* () {
          const json = yield* requestJson(entry.symbol, {
            function: 'GLOBAL_QUOTE',
            symbol: entry.symbol,
          })
          yield* assertNotProviderError(json, entry.symbol)

          const quote = decodeWith(json, GlobalQuoteResponse)?.['Global Quote']
          if (!quote?.['01. symbol']) {
            return yield* new MarketsSchema.MarketDataUnavailable({
              symbol: entry.symbol,
              message: 'no quote returned',
            })
          }

          // Decoded through the domain schema so the MarketId brand is
          // applied at the boundary rather than asserted by hand.
          return Schema.decodeUnknownSync(MarketsSchema.Market)({
            id: entry.id,
            symbol: entry.symbol,
            name: entry.name,
            category: entry.category,
            logoUrl: LOGO_URLS[entry.id] ?? null,
          })
        }),
      { concurrency: 1 },
    ).pipe(
      Effect.tapError((e) =>
        Effect.logWarning(`[market] ${e.symbol}: ${e.message}`),
      ),
    )

    const list: Effect.Effect<
      ReadonlyArray<MarketsSchema.Market>,
      MarketsSchema.MarketDataUnavailable
    > = Effect.gen(function* () {
      const hit = yield* Ref.get(listCache)
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.markets
      const markets = yield* fetchMarkets
      yield* Ref.set(listCache, { at: Date.now(), markets })
      return markets
    })

    /** Full weekly series for a symbol, fetched at most once per TTL. */
    const fullSeries = (market: MarketsSchema.Market) =>
      Effect.gen(function* () {
        const cached = yield* Ref.get(seriesCache)
        const hit = cached.get(market.id)
        if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.points

        const isCrypto = CRYPTO_IDS.has(market.id)
        const json = yield* requestJson(
          market.symbol,
          isCrypto
            ? {
                function: 'TIME_SERIES_WEEKLY',
                symbol: market.symbol,
                market: 'USD',
              }
            : {
                function: 'TIME_SERIES_WEEKLY_ADJUSTED',
                symbol: market.symbol,
              },
        )
        yield* assertNotProviderError(json, market.symbol)

        const series = isCrypto
          ? toPriceMap(
              decodeWith(json, CryptoWeeklyResponse)?.['Weekly Time Series'],
              (v) => v['4. close'],
            )
          : toPriceMap(
              decodeWith(json, WeeklyAdjustedResponse)?.[
                'Weekly Adjusted Time Series'
              ],
              (v) => v['5. adjusted close'],
            )

        const points = toPoints(series)
        yield* Ref.update(seriesCache, (m) =>
          new Map(m).set(market.id, { at: Date.now(), points }),
        )
        return points
      })

    const history = (
      market: MarketsSchema.Market,
      period: MarketsSchema.MarketPeriod,
    ) =>
      Effect.gen(function* () {
        const all = yield* fullSeries(market)
        const points = sliceToPeriod(all, period)
        if (points.length === 0) {
          return yield* new MarketsSchema.MarketNotFound({
            marketId: market.id,
          })
        }
        return { marketId: market.id, points }
      })

    return { list, history } as const
  }),
).pipe(Layer.provide(FetchHttpClient.layer))

const toPriceMap = <V>(
  series: Readonly<Record<string, V>> | undefined,
  price: (value: V) => string,
): Readonly<Record<string, { price: string }>> =>
  Object.fromEntries(
    Object.entries(series ?? {}).map(([date, value]) => [
      date,
      { price: price(value) },
    ]),
  )
