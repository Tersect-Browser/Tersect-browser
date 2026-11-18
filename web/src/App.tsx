import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"

import { AppShell } from "@/components/app-shell"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { BASE_URL } from "@/lib/config"
import { RequireLogin } from "@/features/auth/require-login"
import { BuildPage } from "@/features/datasets/build/build-page"
import { BuildsPage } from "@/features/datasets/build/builds-page"
import { NewDatasetPage } from "@/features/datasets/wizard/new-dataset-page"
import { WizardPage } from "@/features/datasets/wizard/wizard-page"
import { AboutPage } from "@/pages/about"
import { BrowserPage } from "@/pages/browser"
import { HomePage } from "@/pages/home"
import { LoginPage } from "@/pages/login"

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
              <Route path="login" element={<LoginPage />} />
              {/* Managing datasets: behind the login when the server has one. */}
              <Route element={<RequireLogin />}>
                <Route path="datasets/new" element={<NewDatasetPage />} />
                <Route
                  path="datasets/drafts/:draftId"
                  element={<WizardPage />}
                />
                <Route path="builds" element={<BuildsPage />} />
                <Route path="builds/:buildId" element={<BuildPage />} />
              </Route>
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
