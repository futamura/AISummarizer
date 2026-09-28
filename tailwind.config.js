/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/**/*.html'],
  darkMode: 'media',
  theme: {
    extend: {
      keyframes: {
        'toast-enter': {
          from: { opacity: '0', transform: 'translateY(-100%)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'toast-enter': 'toast-enter 400ms ease',
      },
      fontSize: {
        xs: '0.5rem !important', // 8px
        sm: '0.625rem !important', // 10px
        md: '0.75rem !important', // 12px
        base: '0.75rem !important', // 12px
        lg: '0.875rem !important', // 14px
        xl: '1rem !important', // 16px
        '2xl': '1.125rem !important', // 18px
        '3xl': '1.5rem !important', // 24px
        '4xl': '2rem !important', // 32px
        '5xl': '2.5rem !important', // 40px
        '6xl': '3rem !important', // 48px
        '7xl': '3.5rem !important', // 56px
        '8xl': '4rem !important', // 64px
        '9xl': '4.5rem !important', // 72px
        // xs: '8px !important',
        // sm: '10px !important',
        // md: '12px !important',
        // base: '12px !important',
        // lg: '14px !important',
        // xl: '16px !important',
        // '2xl': '18px !important',
        // '3xl': '24px !important',
        // '4xl': '32px !important',
        // '5xl': '40px !important',
        // '6xl': '48px !important',
        // '7xl': '56px !important',
        // '8xl': '64px !important',
        // '9xl': '72px !important',
      },
    },
  },
  plugins: [],
};
