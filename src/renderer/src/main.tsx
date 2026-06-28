import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

// No StrictMode: it double-invokes effects in dev, which would double-attach
// the xterm terminal stream on mount.
const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(<App />)
