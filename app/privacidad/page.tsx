// PLANTILLA: ajústala con los datos reales del organizador y la ley de tu país antes de publicar.
export default function Privacidad() {
  return (
    <main className="container">
      <h1>Política de tratamiento de datos</h1>
      <div className="card">
        <p><strong>Responsable:</strong> [Nombre del organizador], [correo de contacto].</p>
        <p><strong>Datos que recogemos:</strong> nombre, tipo y número de documento, correo, teléfono, fecha de nacimiento,
          ciudad, una foto del participante y, opcionalmente, una foto del documento de identidad. Parte de estos datos se
          consultan a [nombre del proveedor de la API] a partir del número de documento.</p>
        <p><strong>Para qué:</strong> inscribirte en la rifa, asignarte un número, verificar la identidad del ganador
          y mostrar tu nombre y foto en la ruleta durante el sorteo.</p>
        <p><strong>Seguridad:</strong> las fotos se guardan en un almacenamiento privado y cifrado; solo el
          organizador puede verla mediante enlaces temporales. No se comparte con terceros.</p>
        <p><strong>Conservación:</strong> los datos se eliminan a más tardar [30] días después del sorteo, salvo los del
          ganador que deban conservarse por obligación legal.</p>
        <p><strong>Tus derechos:</strong> puedes pedir consultar, corregir o eliminar tus datos escribiendo a [correo].</p>
      </div>
    </main>
  );
}
