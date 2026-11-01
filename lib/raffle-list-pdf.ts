export type RafflePdfRow = {
  document: string; name: string; rank: string; status: string; origin: string; checks?: 0 | 1 | 2 | null;
};

export async function buildRaffleListPdf({ title, raffleName, description, rows, now = new Date() }: {
  title: string; raffleName: string; description: string; rows: RafflePdfRow[]; now?: Date;
}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  const date = now.toLocaleString("es-VE", { timeZone: "America/Caracas" });
  pdf.setProperties({ title: `${title} - ${raffleName}`, subject: "Lista de participantes", creator: "Sistema de control de asistencia" });
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(16);
  pdf.text(title, 10, 15);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(10);
  const subtitle = pdf.splitTextToSize(raffleName, width - 20);
  pdf.text(subtitle, 10, 22);
  const metadataY = 22 + subtitle.length * 5;
  pdf.setFontSize(9);
  const metadata = pdf.splitTextToSize(`${rows.length} personas | ${description} | Generado: ${date} (Caracas)`, width - 20);
  pdf.text(metadata, 10, metadataY);
  const legendY = metadataY + metadata.length * 4;
  pdf.setFontSize(8);
  pdf.text("1 palometa: solo lista | 2 palometas: lista y registro por otra vía o confirmado (anterior o posterior a la importación)", 10, legendY + 2);
  autoTable(pdf, {
    startY: legendY + 7,
    margin: { top: 12, left: 10, right: 10, bottom: 15 },
    head: [["N.º", "Cédula", "Nombre registrado", "Grado", "Estado", "Origen / confirmación"]],
    body: rows.map((row, i) => [String(i + 1), row.document, row.name, row.rank, row.status, row.origin]),
    theme: "striped", showHead: "everyPage", rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: [30, 64, 120], textColor: 255 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 27 }, 2: { cellWidth: 66 }, 3: { cellWidth: 42 }, 4: { cellWidth: 49 }, 5: { cellWidth: 83, cellPadding: { top: 2, bottom: 2, left: 12, right: 2 } } },
    didDrawCell: ({ section, column, row, cell }) => {
      if (section !== "body" || column.index !== 5) return;
      const checks = rows[row.index]?.checks;
      if (checks !== 1 && checks !== 2) return;
      // Dibujar las palometas evita depender de fuentes de emoji en el PDF.
      pdf.saveGraphicsState();
      for (let i = 0; i < checks; i++) {
        const x = cell.x + 2 + i * 4, y = cell.y + cell.height / 2 - 1.5;
        pdf.setFillColor(22, 140, 70); pdf.roundedRect(x, y, 3, 3, 0.4, 0.4, "F");
        pdf.setDrawColor(255); pdf.setLineWidth(0.45);
        pdf.line(x + 0.6, y + 1.5, x + 1.2, y + 2.1);
        pdf.line(x + 1.2, y + 2.1, x + 2.5, y + 0.7);
      }
      pdf.restoreGraphicsState();
    },
  });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(90);
    pdf.text("Sistema de control de asistencia", 10, height - 7);
    pdf.text(`Página ${page} de ${pages}`, width - 10, height - 7, { align: "right" });
  }
  return pdf;
}
