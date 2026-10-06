import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4000' } },
  build: {
    rollupOptions: {
      output: {
        // Split large libraries into their own files so browsers cache them between releases.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/.test(id)) return 'map';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('lucide-react')) return 'icons';
          // Shapefile reader: only loaded on the admin Boundaries page
          if (/[\\/](shpjs|proj4|but-unzip|parsedbf|mgrs|wkt-parser|geographiclib-geodesic|text-encoding-polyfill)[\\/]/.test(id)) return 'shapefile';
          return 'vendor';
        },
      },
    },
  },
});
