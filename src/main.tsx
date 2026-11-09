import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from './lib/queryClient'
import './index.css'
import App from './App.tsx'

// Flip to true to bring the devtools panel back during local debugging.
const ENABLE_QUERY_DEVTOOLS = false

// Safari 17.4+ draws <input type=checkbox switch> as the real iOS switch (with
// its haptic). Elsewhere CSS draws the same shape - but only there, since
// styling it would replace the native one.
if ('switch' in HTMLInputElement.prototype) document.documentElement.dataset.nativeSwitch = ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      {ENABLE_QUERY_DEVTOOLS && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  </StrictMode>,
)
