interface fly {
  cache: {
    get: (key: string) => Promise<ArrayBuffer | null>,
    getString: (key: string) => Promise<string | null>,
    set: (key: string, value: ArrayBuffer | string, ttl?: number) => Promise<boolean>
  }
}
declare var fly: fly
// TODO: Make `getImage` a thing in Fly
export async function get(key: string) {
  const raw = await fly.cache.getString(key + ":meta")
  if (!raw) {
    return null
  }
  let meta = null
  try {
    meta = JSON.parse(raw)
  } catch (err) {
    return null
  }

  const body = await fly.cache.get(key + ":body")

  if (!body) { return null }
  return new Response(body, meta)
}

export async function set(key: string, resp: Response, ttl?: number) {
  const headers: any = resp.headers
  const meta = {
    status: resp.status,
    headers: headers.toJSON() // fly specific function
  }

  const body = await resp.arrayBuffer()
  const result = await Promise.all([
    fly.cache.set(key + ":meta", JSON.stringify(meta), ttl),
    fly.cache.set(key + ":body", body, ttl)
  ])

  for (const r of result) {
    if (!r) return false
  }
  return true
}

export default {
  get,
  set
}