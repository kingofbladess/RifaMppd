import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { data: users } = await supabaseAdmin().from("app_users")
    .select("id, username, full_name, role, is_active, created_at").order("created_at");

  return (
    <main className="container wide tema">
      <div className="topbar">
        <div>
          <h1>Usuarios</h1>
          <p className="sub" style={{ margin: 0 }}>Cada operador entra con su usuario y pueden registrar al mismo tiempo. Para la TV crea un usuario "Pantalla (TV)": entra directo a la ruleta y no ve el panel ni los datos.</p>
        </div>
        <div className="topbar-actions"><a className="btn secondary" href="/admin">← Panel</a></div>
      </div>

      <form className="card" method="post" action="/api/admin/users" style={{ marginBottom: 20 }}>
        <h2>Nuevo usuario</h2>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: 12 }}>
          <div><label>Nombre</label><input name="full_name" required minLength={3} /></div>
          <div><label>Usuario</label><input name="username" required pattern="[a-z0-9._\-]{3,32}" placeholder="ej. maria.p" autoCapitalize="none" /></div>
          <div><label>Contraseña</label><input name="password" type="text" required minLength={8} /></div>
          <div><label>Rol</label>
            <select name="role" defaultValue="operator"><option value="operator">Operador (solo registra)</option><option value="tv">Pantalla (TV): solo la ruleta</option><option value="admin">Administrador</option></select>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        {ok && <p className="small" style={{ color: "var(--ok)" }}>✓ Guardado</p>}
        <button className="btn" style={{ marginTop: 12 }}>Crear usuario</button>
      </form>

      <div className="card table-wrap users-wrap">
        <table className="users-table">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Nueva contraseña</th><th></th></tr></thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td><code>{u.username}</code></td>
                <td>{u.role === "admin" ? "Administrador" : u.role === "tv" ? "Pantalla (TV)" : "Operador"}</td>
                <td><span className={`badge ${u.is_active ? "on" : ""}`}>{u.is_active ? "Activo" : "Inactivo"}</span></td>
                <td>
                  <form method="post" action="/api/admin/users" style={{ display: "flex", gap: 6 }}>
                    <input type="hidden" name="action" value="reset" /><input type="hidden" name="id" value={u.id} />
                    <input name="password" type="text" minLength={8} required placeholder="mín. 8" style={{ maxWidth: 140 }} />
                    <button className="btn secondary">Cambiar</button>
                  </form>
                </td>
                <td>
                  <form method="post" action="/api/admin/users">
                    <input type="hidden" name="action" value="toggle" /><input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="active" value={String(u.is_active)} />
                    <button className="btn secondary">{u.is_active ? "Desactivar" : "Activar"}</button>
                  </form>
                </td>
              </tr>
            ))}
            {!users?.length && <tr><td colSpan={6} className="small">Aún no hay usuarios. Crea el primero arriba.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small">La cuenta <code>admin</code> (contraseña en la variable ADMIN_PASSWORD) siempre puede entrar.</p>
    </main>
  );
}
