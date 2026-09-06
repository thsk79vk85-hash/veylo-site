const screenButtons = [...document.querySelectorAll('.demo-tabs button[data-panel]')];
const screens = [...document.querySelectorAll('.demo-panel')];

for (const button of screenButtons) {
  button.addEventListener('click', () => {
    for (const screen of screens) screen.hidden = screen.id !== button.dataset.panel;
    for (const item of screenButtons) item.setAttribute('aria-pressed', String(item === button));
  });
}
