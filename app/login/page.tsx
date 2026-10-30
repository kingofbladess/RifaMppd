export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "", error } = await searchParams;
  return (
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>🎟️ Ingresar</h1>
      <p className="sub">Operadores de registro y administradores.</p>
      <form className="card" method="post" action="/api/login">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="username">Usuario</label>
        <input id="username" name="username" required autoFocus autoCapitalize="none" autoComplete="username" />
        <label htmlFor="password" style={{ marginTop: 12 }}>Contraseña</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" />
        {error === "config" && <p className="error">El servidor no tiene configurada la conexión con Supabase. Revisa las variables de entorno en Vercel.</p>}
        {error && error !== "config" && <p className="error">Usuario o contraseña incorrectos</p>}
        <button className="btn" style={{ width: "100%", marginTop: 16 }}>Entrar</button>
      </form>
    </main>
  );
}
