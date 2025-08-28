/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {},
  },
  corePlugins: {
    preflight: false, // 使用 VSCode 原生样式与现有全局样式
  },
};
