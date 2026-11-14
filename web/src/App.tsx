import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppShell } from "@/components/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { BASE_URL } from "@/lib/config"
import { AboutPage } from "@/pages/about"
import { BrowserPage } from "@/pages/browser"
import { HomePage } from "@/pages/home"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={BASE_URL.replace(/\/$/, "")}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="share/:exportId" element={<BrowserPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
