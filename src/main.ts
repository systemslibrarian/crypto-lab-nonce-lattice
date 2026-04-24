import './style.css';
import { mountApp } from './app';

function bindThemeToggle(): void {
	const button = document.querySelector<HTMLButtonElement>('[data-theme-toggle]');
	if (!button) return;
	button.addEventListener('click', () => {
		const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
		const next = current === 'dark' ? 'light' : 'dark';
		document.documentElement.setAttribute('data-theme', next);
		localStorage.setItem('theme', next);
	});
}

bindThemeToggle();
mountApp(document.querySelector<HTMLDivElement>('#app'));