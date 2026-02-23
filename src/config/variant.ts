export const SITE_VARIANT: string = (() => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('worldmonitor-variant');
    if (stored === 'tech' || stored === 'full' || stored === 'finance' || stored === 'nexus') return stored;
  }
  const envVariant = import.meta.env.VITE_VARIANT || 'full';
  return envVariant === 'nexus' ? 'nexus' : envVariant;
})();
