import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/index.js", "utf8")

content = content.replace(
  "import autoServiceRoutes from './routes/autoServiceRoutes.js'",
  "import autoServiceRoutes from './routes/autoServiceRoutes.js'\nimport verificationRoutes from './routes/verificationRoutes.js'"
)

content = content.replace(
  "fastify.register(autoServiceRoutes,   { prefix: '/api/auto-service' });",
  "fastify.register(autoServiceRoutes,   { prefix: '/api/auto-service' });\nfastify.register(verificationRoutes,  { prefix: '/api/verification' });"
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/index.js", content, "utf8")
console.log("index.js guncellendi!")