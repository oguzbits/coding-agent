import { BrowserRouter, Route, Routes } from 'react-router';
import { AuthPage } from './auth/auth-page';
import { ConfirmEmailPage } from './auth/confirm-email-page';
import { ForgotPasswordPage } from './auth/forgot-password-page';
import { ResetPasswordPage } from './auth/reset-password-page';
import { RequireAuth } from './auth/require-auth';
import { AppShell } from './layout/app-shell';
import { ChatPage } from './pages/chat-page';
import { SettingsPage } from './pages/settings-page';
import { StartPage } from './pages/start-page';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/confirm-email" element={<ConfirmEmailPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<StartPage />} />
          <Route path="c/:id" element={<ChatPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
