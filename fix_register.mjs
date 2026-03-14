import { readFileSync, writeFileSync } from "fs"
let content = readFileSync("C:/Users/PC/Desktop/tecrubelerim/src/index.js", "utf8")

content = content.replace(
  "fastify.register(subscriptionRoutes, { prefix: '/api/subscriptions' });",
  "fastify.register(subscriptionRoutes, { prefix: '/api/subscriptions' });\nfastify.register(autoServiceRoutes,   { prefix: '/api/auto-service' });"
)

writeFileSync("C:/Users/PC/Desktop/tecrubelerim/src/index.js", content, "utf8")
console.log("Register eklendi!")