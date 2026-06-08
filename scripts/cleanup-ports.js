// cleanup-ports.js — Libère les ports 3001 et 4173 avant le démarrage
// SI Génie Consultant v129
import { execSync } from 'child_process';

const PORTS = [3001, 4173];

for (const port of PORTS) {
  try {
    const isWin = process.platform === 'win32';
    if (isWin) {
      // Windows : trouver le PID via netstat et le tuer
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] });
      const lines = result.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } catch {
          // ignore
        }
      }
    } else {
      // Linux/Mac
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore', shell: true });
    }
    console.log(`✅ Port ${port} libéré`);
  } catch {
    console.log(`ℹ️  Port ${port} déjà libre`);
  }
}
