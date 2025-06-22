import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Home from './Home.jsx'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Connection } from '@solana/web3.js'

const solanaConnection = new Connection('http://127.0.0.1:8899');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home connection={solanaConnection} />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
