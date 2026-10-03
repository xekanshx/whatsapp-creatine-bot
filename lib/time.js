// Date helpers. "Today" is always the calendar date in TIMEZONE, as YYYY-MM-DD.

function getTimezone() {
  return process.env.TIMEZONE || 'UTC';
}

// Throws RangeError on an invalid IANA zone; called at startup so it fails fast.
function assertValidTimezone() {
  new Intl.DateTimeFormat('en-CA', { timeZone: getTimezone() });
}

function nowInTimezone(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: getTimezone(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function previousDay(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

module.exports = { assertValidTimezone, nowInTimezone, previousDay };
