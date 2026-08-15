// Plain CSV generation — no dependency, no database, no Electron — so it's
// simple to unit test on its own. Handles the standard escaping rules:
// wrap in quotes and double up any quote characters whenever a value
// contains a comma, quote, or newline.

function toCsvValue(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// columns: [{ key, header }]. rows: plain objects keyed by `key`.
function toCsv(rows, columns) {
  const headerLine = columns.map((c) => toCsvValue(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => toCsvValue(row[c.key])).join(','));
  return [headerLine, ...lines].join('\r\n');
}

module.exports = { toCsvValue, toCsv };
