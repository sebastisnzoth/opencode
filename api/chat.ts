import type { VercelRequest, VercelResponse } from "@vercel/node"

const ALLOWED_MODELS = new Set([
  "openrouter/auto",
  "openai/gpt-6-luna",
  "openai/gpt-6-luna-pro",
  "openai/gpt-5.1-codex-max",
])

function cors(res: VercelResponse) {
  const origin = process.env.ALLOWED_ORIGIN || "*"
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res)
  if (req.method === "OPTIONS") return res.status(204).end()
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } })

  const key = process.env.OPENROUTER_API_KEY
  if (!key) return res.status(503).json({ error: { message: "Backend is not configured" } })

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const model = typeof body?.model === "string" && ALLOWED_MODELS.has(body.model) ? body.model : "openrouter/auto"

  if (!messages.length || messages.length > 50) {
    return res.status(400).json({ error: { message: "messages must contain between 1 and 50 items" } })
  }

  const safeMessages = messages.filter((m: any) =>
    m && (m.role === "user" || m.role === "assistant" || m.role === "system") &&
    typeof m.content === "string" && m.content.length <= 20000
  )

  if (!safeMessages.length) return res.status(400).json({ error: { message: "No valid messages" } })

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://sebastisnzoth.github.io/opencode/",
        "X-Title": "OpenCode Chat",
      },
      body: JSON.stringify({ model, messages: safeMessages }),
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json")
    return res.send(text)
  } catch {
    return res.status(502).json({ error: { message: "Upstream OpenRouter request failed" } })
  }
}
