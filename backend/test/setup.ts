// Entorno de pruebas: usa la BD de backend/.env (rama dev de Neon), nunca producción.
try {
  process.loadEnvFile(".env");
} catch {
  // en CI las variables vienen del entorno
}

process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.ADMIN_EMAILS = "admin@medidoc.test";
// Las pruebas no hablan con Google; valores ficticios si aún no están configurados.
process.env.GOOGLE_CLIENT_ID ||= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "test-client-secret";
