import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/index.js", "utf8")

// import ekle
content = content.replace(
  "import muhtarRoutes from './routes/muhtarRoutes.js'",
  "import muhtarRoutes from './routes/muhtarRoutes.js'\nimport autoServiceRoutes from './routes/autoServiceRoutes.js'"
)

// register ekle
content = content.replace(
  "fastify.register(muhtarRoutes, { prefix: '/api/muhtar' })",
  "fastify.register(muhtarRoutes, { prefix: '/api/muhtar' })\nfastify.register(autoServiceRoutes, { prefix: '/api/auto-service' })"
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/index.js", content, "utf8")
console.log("index.js guncellendi!")