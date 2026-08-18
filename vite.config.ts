import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so built asset URLs work regardless of which repo/subpath
// this ends up hosted under. `npm run deploy` pushes the default dist/
// output to a gh-pages branch (see package.json) -- point GitHub Pages at
// "Deploy from branch: gh-pages" for this.
export default defineConfig({
  plugins: [react()],
  base: './',
})
