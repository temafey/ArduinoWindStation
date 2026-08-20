import WindDashboard from '../../wind-dashboard.jsx'
import { AppGuard } from '../../wind-guard.jsx'

// Граница ошибок обязана быть снаружи дашборда, а не внутри него: React
// отдаёт сбой только тому, кто стоит выше упавшего места. Стой она внутри,
// падение самого дашборда прошло бы мимо неё — и экран снова стал бы пустым.
export default function App() {
  return (
    <AppGuard>
      <WindDashboard />
    </AppGuard>
  )
}
