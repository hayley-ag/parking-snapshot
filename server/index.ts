import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { router } from './routes'

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set. Add it to .env before submitting forms.')
}

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use('/api', router)

// Serve built client in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../public')
  app.use(express.static(clientPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
