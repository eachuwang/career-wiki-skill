/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        // 职业知识库主色系
        brand: {
          50: '#eef6ff',
          100: '#d9ecff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a8ff',
          500: '#3498db',
          600: '#2b7fc4',
          700: '#2566a0',
          800: '#215680',
          900: '#1d4866',
        },
        ink: {
          50: '#f8f9fa',
          100: '#eef0f2',
          200: '#d8dde2',
          300: '#b4bcc4',
          400: '#8693a0',
          500: '#5a6a7a',
          600: '#475566',
          700: '#3a4554',
          800: '#2c3e50',
          900: '#1a1a2e',
        },
      },
      fontFamily: {
        sans: ['PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', 'sans-serif'],
        serif: ['Times New Roman', 'Georgia', 'SimSun', 'serif'],
      },
    },
  },
  plugins: [],
};
