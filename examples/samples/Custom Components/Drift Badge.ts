var permitted = document.getElementById('badge-permitted') as any;
if (permitted) {
  permitted.driftStatus = 'PERMITTED_DRIFT';
  permitted.triggerSource = 'MOTION';
  permitted.exemptUntil = new Date(Date.now() + 24 * 60 * 60000).toISOString();
}

var unexpected = document.getElementById('badge-unexpected') as any;
if (unexpected) {
  unexpected.driftStatus = 'UNEXPECTED_DRIFT';
}

var normal = document.getElementById('badge-normal') as any;
if (normal) {
  normal.driftStatus = 'NORMAL';
}

var vibration = document.getElementById('badge-vibration') as any;
if (vibration) {
  vibration.driftStatus = 'PERMITTED_DRIFT';
  vibration.triggerSource = 'VIBRATION';
  vibration.exemptUntil = new Date(Date.now() + 5 * 60000).toISOString();
}

var temperature = document.getElementById('badge-temperature') as any;
if (temperature) {
  temperature.driftStatus = 'PERMITTED_DRIFT';
  temperature.triggerSource = 'TEMPERATURE';
  temperature.exemptUntil = new Date(Date.now() + 2 * 60 * 60000).toISOString();
}
