export function fixTurkish(obj) {
  if (!obj) return obj
  if (typeof obj === 'string') {
    try { return decodeURIComponent(escape(obj)) } catch { return obj }
  }
  if (Array.isArray(obj)) return obj.map(fixTurkish)
  if (typeof obj === 'object') {
    const result = {}
    for (const key of Object.keys(obj)) result[key] = fixTurkish(obj[key])
    return result
  }
  return obj
}