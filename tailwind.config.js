/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void: {
          50: '#e6e6ef',
          100: '#1a1a2e',
          200: '#13132b',
          300: '#0f0f23',
          400: '#0c0c1d',
          500: '#0a0a17',
          600: '#080812',
          700: '#06060e',
          800: '#04040a',
          900: '#020206',
          950: '#0a0a0f',
        },
        neon: {
          green: '#00ff88',
          cyan: '#00e5ff',
          pink: '#ff006e',
          amber: '#ffbe0b',
          purple: '#8338ec',
        },
        steel: {
          100: '#e8e8ed',
          200: '#c4c4cf',
          300: '#9d9db2',
          400: '#6b6b85',
          500: '#4a4a62',
          600: '#33334a',
          700: '#252538',
          800: '#1a1a2a',
          900: '#12121f',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        display: ['"Orbitron"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
      },
      animation: {
        'pulse-neon': 'pulseNeon 2s ease-in-out infinite',
        'scan-line': 'scanLine 8s linear infinite',
        'glow-breathe': 'glowBreathe 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        pulseNeon: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.7 },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        glowBreathe: {
          '0%, 100%': { boxShadow: '0 0 5px rgba(0,255,136,0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(0,255,136,0.6)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
      boxShadow: {
        'neon-green': '0 0 15px rgba(0,255,136,0.4), 0 0 45px rgba(0,255,136,0.1)',
        'neon-cyan': '0 0 15px rgba(0,229,255,0.4), 0 0 45px rgba(0,229,255,0.1)',
        'neon-pink': '0 0 15px rgba(255,0,110,0.4), 0 0 45px rgba(255,0,110,0.1)',
        'inner-glow': 'inset 0 0 30px rgba(0,255,136,0.05)',
      },
    },
  },
  plugins: [],
};
