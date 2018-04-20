import { processImages } from './src/images'
import backends from 'onehostname/lib/backends'

const origin = backends.generic("https://blog.ghost.org", { host: "blog.ghost.org" })

const processor = processImages(origin, { detectWebp: true })

fly.http.respondWith(processor)