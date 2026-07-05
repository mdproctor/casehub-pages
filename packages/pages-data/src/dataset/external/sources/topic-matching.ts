export function matchesTopic(pattern: string, topic: string): boolean {
  const ps = pattern.split(':');
  const ts = topic.split(':');

  if (ps[ps.length - 1] === '**') {
    if (ts.length < ps.length - 1) return false;
    for (let i = 0; i < ps.length - 1; i++) {
      if (ps[i] !== '*' && ps[i] !== ts[i]) return false;
    }
    return true;
  }

  if (ps.length !== ts.length) return false;
  for (let i = 0; i < ps.length; i++) {
    if (ps[i] === '*') continue;
    if (ps[i] !== ts[i]) return false;
  }
  return true;
}

export function isMatchedByRegistrations(topic: string, registrations: Set<string>): boolean {
  for (const reg of registrations) {
    if (matchesTopic(reg, topic)) return true;
  }
  return false;
}
