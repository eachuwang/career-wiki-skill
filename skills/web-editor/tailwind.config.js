/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{tsx,ts}'],
  theme: {
    extend: {
      colors: {
        // 职业知识库主色系
        brand: {
          50: '#fbf5ec',
          100: '#f4e8d7',
          200: '#e8d2b9',
          300: '#d7b18d',
          400: '#bd895e',
          500: '#9b6744',
          600: '#7f5035',
          700: '#663f2d',
          800: '#523326',
          900: '#42291f',
        },
        ink: {
          50: '#fdfbf7',
          100: '#f6f1e9',
          200: '#e8e0d4',
          300: '#d2c7b8',
          400: '#a79a8a',
          500: '#7d7164',
          600: '#655a50',
          700: '#50473f',
          800: '#3f3832',
          900: '#302a25',
        },
      },
      fontFamily: {
        sans: ['system-ui', 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', 'sans-serif'],
        serif: ['Times New Roman', 'Georgia', 'SimSun', 'serif'],
      },
    },
  },
  plugins: [],
};
