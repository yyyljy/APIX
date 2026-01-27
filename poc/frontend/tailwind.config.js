/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: ['selector', '[data-theme="dark"]'], // Enable dark mode via data-theme attribute
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                // We can keep the CSS variables if we want, or define them here.
                // For now, let's allow Tailwind's default colors + extend if needed.
                // The mockups used specific blues, let's add them to be safe if utility classes referenced 'primary'
            }
        },
    },
    plugins: [],
}
