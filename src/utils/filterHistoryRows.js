const toSafeString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).toLowerCase();
};

export function filterHistoryRowsByQuery(rows, query, mode = 'battery') {
  if (!Array.isArray(rows)) return [];
  const q = toSafeString(query).trim();
  if (!q) return rows;

  return rows.filter((row) => {
    const createdAt = row?.created_at ? new Date(row.created_at) : null;
    const dateStr = createdAt ? createdAt.toLocaleDateString('fr-FR') : '';
    const timeStr = createdAt
      ? createdAt.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : '';

    const batteryStr =
      row?.pourcentage_batterie != null && Number.isFinite(Number(row.pourcentage_batterie))
        ? `${Math.round(Number(row.pourcentage_batterie))}%`
        : '';

    const fields = [
      dateStr,
      timeStr,
      row?.robot,
      row?.nom,
      row?.id,
      row?.robot_id,
      row?.user_id,
      batteryStr,
      mode,
    ];

    return fields.some((field) => toSafeString(field).includes(q));
  });
}
