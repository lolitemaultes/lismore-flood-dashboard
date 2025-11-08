// Theme Switcher for Lismore Flood Dashboard
// Manages dark/light mode toggle with localStorage persistence

(function() {
    'use strict';

    // Initialize theme on page load
    function initTheme() {
        // Check for saved theme preference, otherwise check system preference
        const savedTheme = localStorage.getItem('theme');
        const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Determine initial theme
        let initialTheme;
        if (savedTheme) {
            initialTheme = savedTheme;
        } else if (systemPrefersDark) {
            initialTheme = 'dark';
        } else {
            initialTheme = 'light';
        }

        // Apply theme
        setTheme(initialTheme, false);
    }

    // Set theme and update UI
    function setTheme(theme, save = true) {
        const root = document.documentElement;

        // Update data-theme attribute
        root.setAttribute('data-theme', theme);

        // Save preference
        if (save) {
            localStorage.setItem('theme', theme);
        }

        // Update toggle button state
        updateToggleButton(theme);
    }

    // Update toggle button appearance
    function updateToggleButton(theme) {
        const toggleButton = document.getElementById('theme-toggle');
        if (!toggleButton) return;

        const sunIcon = toggleButton.querySelector('.theme-icon-sun');
        const moonIcon = toggleButton.querySelector('.theme-icon-moon');

        if (theme === 'dark') {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
            toggleButton.setAttribute('aria-label', 'Switch to light mode');
            toggleButton.setAttribute('title', 'Switch to light mode');
        } else {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
            toggleButton.setAttribute('aria-label', 'Switch to dark mode');
            toggleButton.setAttribute('title', 'Switch to dark mode');
        }
    }

    // Toggle theme
    function toggleTheme() {
        const root = document.documentElement;
        const currentTheme = root.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    }

    // Listen for system theme changes
    if (window.matchMedia) {
        const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');

        // Modern browsers
        if (darkModeQuery.addEventListener) {
            darkModeQuery.addEventListener('change', (e) => {
                // Only auto-switch if user hasn't manually set a preference
                if (!localStorage.getItem('theme')) {
                    setTheme(e.matches ? 'dark' : 'light', false);
                }
            });
        }
        // Legacy browsers
        else if (darkModeQuery.addListener) {
            darkModeQuery.addListener((e) => {
                if (!localStorage.getItem('theme')) {
                    setTheme(e.matches ? 'dark' : 'light', false);
                }
            });
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }

    // Expose toggle function globally for button onclick
    window.toggleTheme = toggleTheme;
})();
