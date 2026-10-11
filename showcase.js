const stage = document.querySelector('.hero-stage');
const screenButtons = [...document.querySelectorAll('[data-panel]')];
const screens = [...document.querySelectorAll('.demo-panel')];
const progress = document.querySelector('.preview-progress');
const names = ['Campus', 'Feed', 'Friends', 'Chats', 'Profile'];
let active = 0;
function selectScreen(index) {
  active = (index + screens.length) % screens.length;
  for (const [i, screen] of screens.entries()) screen.hidden = i !== active;
  for (const button of screenButtons) button.setAttribute('aria-pressed', String(button.dataset.panel === screens[active].id));
  progress.textContent = `${active + 1} / ${screens.length} · ${names[active]}`;
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) screens[active].animate?.([
    { opacity: 0.4, transform: 'translateX(10px)' }, { opacity: 1, transform: 'translateX(0)' }
  ], { duration: 240, easing: 'ease-out' });
}
for (const button of screenButtons) button.addEventListener('click', () => selectScreen(screens.findIndex(s => s.id === button.dataset.panel)));
stage.querySelector('.preview-previous').addEventListener('click', () => selectScreen(active - 1));
stage.querySelector('.preview-next').addEventListener('click', () => selectScreen(active + 1));
stage.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  selectScreen(active + (event.key === 'ArrowRight' ? 1 : -1));
});
const phone = stage.querySelector('.phone');
let gesture = null;
phone.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || event.target.closest('button')) return;
  gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  phone.setPointerCapture(event.pointerId);
});
phone.addEventListener('pointerup', event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
  gesture = null;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) selectScreen(active + (dx < 0 ? 1 : -1));
});
phone.addEventListener('pointercancel', () => { gesture = null; });
let lastScroll = 0;
phone.addEventListener('wheel', event => {
  if (Math.abs(event.deltaX) < 12 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
  event.preventDefault();
  if (Date.now() - lastScroll < 600) return;
  selectScreen(active + (event.deltaX > 0 ? 1 : -1));
  lastScroll = Date.now();
}, { passive: false });
