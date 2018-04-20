import respCache from "./cache";
import * as Color from 'color'

declare var fly: any
declare var crypto: any
declare var cache: any // web api cache
export interface Fetch {
  (req: RequestInfo, info?: RequestInit): Promise<Response>
}

export interface ProcessOptions {
  detectWebp?: boolean
}

export function processImages(fetch: Fetch, opts?: ProcessOptions): Fetch {
  if (!opts) {
    opts = {
      detectWebp: true
    }
  }
  // A fetch like function to handle image processing
  const processImagesFetch = async function processImages(req: RequestInfo, info?: RequestInit) {
    if (typeof req === "string") {
      req = new Request(req)
    }
    const url = new URL(req.url)
    const params = buildOptions(req, url)
    console.debug("params:", params)

    const key = cacheKey(url, params)
    let resp = await respCache.get(key + "asdf")

    if (resp) {
      resp.headers.set("cache", "HIT")
      return resp
    } // already done, cached, etc

    req.headers.delete("accept-encoding") // make sure we don't get gzip

    // this is a little hacky, but it caches the master with normal http caching
    resp = await cache.match(req)
    if (!resp) {
      resp = await fetch(req, info)

      cache.put(req, resp.clone())
    }
    console.log("Watermark url:", params.watermark && params.watermark.url)
    let wresp = params.watermark ? await fetch(new Request(params.watermark.url)) : null
    let contentType = resp.headers.get("content-type") || ""
    if (resp.status != 200 || !contentType.includes("image/")) {
      // not an image, pass through
      return resp
    }
    if (wresp) {
      contentType = wresp.headers.get("content-type") || ""
      if (wresp.status != 200 || !contentType.includes("image/")) {
        // watermark not found
        return new Response("watermark url not found (or not an image)", { status: 500 })
      }
    }

    const body = await resp.arrayBuffer()
    console.debug("body length:", body.byteLength)
    let img = new fly.Image(body)

    // this just applies the ops to the image without actually writing it out
    img = await resize(img, params)

    if (wresp && params.watermark) {
      const wbody = await wresp.arrayBuffer()
      const wmark = new fly.Image(wbody)
      console.debug("watermark loaded:", wbody.byteLength)
      const wm = await watermark(img, wmark, params)
      img.overlayWith(wm, { gravity: params.watermark.position })
      console.debug("watermark done")
    }
    if (params.format) {
      const fn = img[params.format]
      if (fn && typeof fn === "function") {
        fn.apply(img)
        resp.headers.set("content-type", `image/${params.format}`)
      }
    }

    const result = await img.toBuffer()
    const data = <ArrayBuffer>result.data
    resp.headers.set("content-length", data.byteLength.toString())
    resp.headers.set("cache", "MISS")
    resp.headers.set("cache-key", key)
    respCache.set(key, new Response(data, resp), 3600)
    return new Response(data, resp)
  }

  const buildOptions = function buildOptions(req: Request, url?: URL): ImageOptions {
    if (!url) url = new URL(req.url)
    const params: ImageOptions = new (<any>defaultImageOptions.constructor)()
    /*{
      width: new Unit(url.searchParams.get("w")),
        height: new Unit(url.searchParams.get("h")),
          format: extractFormat(url.searchParams.get("format"))
    }*/
    for (const p of urlParams) {
      const v = p.parser(url.searchParams.get(p.param))
      params[p.key] = v
    }
    const w = url.searchParams.get("w_url")
    if (w) {
      const wurl = new URL(req.url)
      wurl.pathname = w
      wurl.search = ""
      params.watermark = {
        url: wurl.toString(),
        width: defaultUnit,
        height: defaultUnit
      }
      for (const p of urlParamsWatermark) {
        const v = p.parser(url.searchParams.get(p.param))
        if (p.key !== "url")
          params.watermark[p.key] = v
      }
    }
    const accept = req.headers.get("accept") || ""
    if (!params.format && opts && opts.detectWebp && accept.includes("image/webp")) {
      params.format = "webp" // output to webp if possible
    }
    return params
  }

  return processImagesFetch
}


async function watermark(image: any, wmark: any, opts: ImageOptions) {
  if (!opts.watermark) {
    throw new Error("this shouldn't ever happen, wtf")
  }

  const meta = image.metadata()
  let wmeta = wmark.metadata()

  // padding expands the canvas and fills it with the background color
  let padding = scaleValue(opts.watermark.padding, meta.width) || 0
  let width = scaleValue(opts.watermark.width, meta.width)
  let height = scaleValue(opts.watermark.height, meta.height)

  if (width || height) {
    // resize wmark to requested size
    // make sure we're not making an overlay that's bigger than the image
    if (width && width > meta.width) {
      width = meta.width
      padding = 0
    }
    if (height && height > meta.height) {
      height = meta.height
      padding = 0
    }
    wmark = await wmark.withoutEnlargement().resize(width, height).toImage()
    wmeta = wmark.metadata()
    width = wmeta.width
    height = wmeta.height
  }

  if (!opts.watermark.background) {
    // default to transparent background on watermark
    opts.watermark.background = 'transparent'
  }
  console.debug("watermark: applying bg", opts.watermark.background)
  const color = Color(opts.watermark.background || defaultWatermarkOptions.background).object()
  if (color.alpha === undefined) {
    color.alpha = 1.0
  }

  //build a canvas with bg color + padding for watermark
  const bg = new fly.Image({
    width: (width || wmeta.width) + padding,
    height: (height || wmeta.height) + padding,
    background: color,
    channels: 4
  }).png()

  // do overlay and get arrayBuffer
  let buf = await bg.overlayWith(wmark).toBuffer()

  return <ArrayBuffer>buf.data
}
async function resize(image: any, opts: ImageOptions) {
  if (defaultSizeOptions.equivalent(opts)) {
    console.debug("resize noop:", JSON.stringify(opts))
    return image
  }
  let width: number | undefined
  let height: number | undefined
  if (opts.width.unit === "px") {
    width = opts.width.value
  }
  if (opts.height.unit === "px") {
    height = opts.height.value
  }
  if (width && !height) { }
  console.debug("resizing:", width, height, null)
  return await image.resize(width, height).toImage()
}

function extractFormat(raw: string | null) {
  if (!raw) {
    return undefined
  }
  const v = Format[<any>raw]
  if (!v) {
    return undefined
  }
  return v
}

function scaleValue(u: Unit | undefined, v: number) {
  if (!u) return undefined
  switch (u.unit) {
    case 'px':
      return u.value
    case '%':
      return Math.round(u.value / 100 * v)
    default:
      return undefined
  }
}

function cacheKey(url: URL, opts: ImageOptions) {
  let parts = [{ k: "_v", v: "1" }]
  for (const k of Object.keys(opts)) {
    const v = opts[k]
    const d = defaultImageOptions[k]
    if (v && (!d || v.valueOf() != d.valueOf())) {
      parts.push({ k: paramUrlMap[k], v: v.valueOf() })
    }
  }
  if (opts.watermark) {
    for (let k of Object.keys(opts.watermark)) {
      const v = opts.watermark[k]
      const d = defaultWatermarkOptions[k]
      k = paramUrlWatermarkMap[k]
      if (v && (!d || v.valueOf() != d.valueOf())) {
        parts.push({ k: k, v: v.valueOf() })
      }
    }
  }
  parts = parts.sort()
  return url.pathname +
    ":" + parts.map((p) => p.k).join("|") + // keys in plain english
    ":" + crypto.subtle.digestSync("sha-1", parts.map((p) => p.v).join("|"), "hex") // values as sha-1 hash
}

export class Unit {
  value: number
  unit: string
  hash: string

  constructor(raw?: number | string | null) {
    this.value = 1
    this.unit = "auto"
    if (raw && typeof raw === "string") {
      const match = raw.match(/^(\d+(\.\d+)?)(%|px)?$/)
      if (match) {
        if (match[2]) {
          this.value = parseFloat(match[1] + match[2])
        } else {
          this.value = parseInt(match[1])
        }
        this.unit = match[3] || 'px'
      } else {
        throw new Error("Invalid Unit value, must start with a number and end with either px or %:" + JSON.stringify(raw))
      }
    } else if (typeof raw === "number") {
      this.value = raw
    }
    this.hash = `${this.value}${this.unit}`
  }

  public valueOf() {
    return `${this.value}${this.unit}`
  }

  public static parser(raw?: number | string | null) {
    return new Unit(raw)
  }
}

interface paramParser {
  (raw: any): any
}
const urlParams = [
  { param: 'w', key: "width", parser: <paramParser>Unit.parser },
  { param: 'h', key: "height", parser: <paramParser>Unit.parser },
  { param: "f", key: "format", parser: <paramParser>extractFormat },
]
const paramUrlMap: any = {}
urlParams.forEach((p) => paramUrlMap[p.key] = p.param)

const urlParamsWatermark = urlParams.map((p) => {
  return { param: "w_" + p.param, key: p.key, parser: p.parser }
}).concat([
  { param: "w_url", key: "url", parser: (raw) => raw }, // set manually for now
  { param: "w_bg", key: "background", parser: (raw) => raw },
  { param: "w_pos", key: "position", parser: (raw) => raw },
  { param: "w_pad", key: "padding", parser: Unit.parser }
])
const paramUrlWatermarkMap: any = {}
urlParamsWatermark.forEach((p) => paramUrlWatermarkMap[p.key] = p.param)

enum Format {
  png = "png",
  jpeg = "jpeg",
  jpg = "jpeg",
  webp = "webp"
}

interface ImageOptions {
  width: Unit,
  height: Unit,
  format?: string,
  watermark?: WatermarkOptions,
  [index: string]: any
}

interface WatermarkOptions {
  width: Unit,
  height: Unit,
  url: string
  position?: string
  background?: string,
  padding?: Unit
  [index: string]: any
}


const defaultUnit = new Unit()
const defaultSizeOptions: ImageOptions = {
  width: defaultUnit,
  height: defaultUnit,
  equivalent: function (other: ImageOptions) {
    return this.width === other.width &&
      this.height === other.height
  }
}
const defaultImageOptions: ImageOptions = {
  width: defaultSizeOptions.width,
  height: defaultSizeOptions.height,
  equivalent: function (other: ImageOptions) {
    return defaultSizeOptions.equivalent(other) &&
      this.format === other.format

  }
}

const defaultWatermarkOptions: WatermarkOptions = {
  url: "",
  background: "rgba(0,0,0,0.0)",
  width: defaultUnit,
  height: defaultUnit,
  padding: defaultUnit
}