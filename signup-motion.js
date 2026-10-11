const root=document; const result=document.querySelector("#beta-result"); const emailPreview=null;
// Short, one-shot motion; never autoplay screens or hide content awaiting a reveal.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const activeAnimations = new Set();
function enter(element, delay = 0) {
  if (!element || reducedMotion.matches || !element.animate) return;
  const animation = element.animate([
    { opacity: .2, transform: 'translateY(18px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 520, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' });
  activeAnimations.add(animation);
  const cleanup = () => activeAnimations.delete(animation);
  animation.addEventListener('finish', cleanup, { once: true });
  animation.addEventListener('cancel', cleanup, { once: true });
}
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) for (const animation of [...activeAnimations]) animation.cancel();
});
if ('IntersectionObserver' in window) {
  const reveals = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      enter(entry.target);
      reveals.unobserve(entry.target);
    });
  }, { threshold: .08 });
  root.querySelectorAll('.hero-copy,.hero-stage,.moment-card,.beta-intro,.beta-card,.launch-choice>div').forEach(element => reveals.observe(element));
}
const stateChanges = new MutationObserver(changes => {
  for (const change of changes) if (!change.target.hidden) enter(change.target);
});
for (const element of [result, emailPreview, root.querySelector('#launch-result')].filter(Boolean)) {
  stateChanges.observe(element, { attributes: true, attributeFilter: ['hidden'] });
}
