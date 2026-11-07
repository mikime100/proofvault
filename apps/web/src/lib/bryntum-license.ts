// Must be imported before any @bryntum/* module so the key is set before
// Bryntum initializes. Value comes from VITE_BRYNTUM_LICENSE_KEY (gitignored).
const g = globalThis as { bryntum?: { licenseKey?: string } };
(g.bryntum ??= {}).licenseKey = import.meta.env.VITE_BRYNTUM_LICENSE_KEY ?? '';
