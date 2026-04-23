import './style.css';
import { mountApp } from './app';

function applyThemeButtonState(button: HTMLButtonElement | null): void {
	if (!button) {
		return;
	}
	const theme = document.documentElement.getAttribute('data-theme') ?? 'dark';
	const nextTheme = theme === 'dark' ? 'light' : 'dark';
	button.textContent = theme === 'dark' ? '🌙' : '☀️';
	button.setAttribute('aria-label', nextTheme === 'light' ? 'Switch to light mode' : 'Switch to dark mode');
}

function bindThemeToggle(): void {
	const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
	applyThemeButtonState(button);
	button?.addEventListener('click', () => {
		const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
		const next = current === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		localStorage.setItem('theme', next);
		applyThemeButtonState(button);
	});
}

mountApp(document.querySelector<HTMLDivElement>('#app'), bindThemeToggle);