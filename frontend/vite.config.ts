import path from "path";
import react from "@vitejs/plugin-react-swc"; // Using SWC plugin as per your reference
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
