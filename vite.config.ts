import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" にしておくと、GitHub Pages などサブパス配信でもパスが壊れません。
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: true, // 同じWi-Fiのスマホからも確認できるようにする
  },
});
