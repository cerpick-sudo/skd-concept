(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectModel(tab, moveFocus = false) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (moveFocus) tab.focus();
    queueCueUpdate();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectModel(tab));
    tab.addEventListener('keydown', event => {
      let target = index;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = tabs.length - 1;
      else return;
      event.preventDefault(); event.stopPropagation(); selectModel(tabs[target], true);
    });
  });
  const levers = [...document.querySelectorAll('.levers details')];
  levers.forEach(detail => detail.addEventListener('toggle', () => {
    if (detail.open) levers.forEach(other => { if (other !== detail) other.open = false; });
    queueCueUpdate();
  }));

  const scenes = [...document.querySelectorAll('.scene')];
  const toggle = document.getElementById('present-toggle');
  const controls = document.querySelector('.presentation-controls');
  const previous = document.getElementById('slide-prev');
  const next = document.getElementById('slide-next');
  const scrollCue = document.getElementById('scroll-cue');
  const mobileNav = document.querySelector('.mobile-nav');
  let presenting = false;
  let current = 0;
  function queueCueUpdate() {
    const scene = scenes[current];
    const remaining = scene.scrollHeight - scene.clientHeight - scene.scrollTop;
    scrollCue.hidden = !presenting || remaining < 2;
  }
  function showSlide(index) {
    current = Math.max(0, Math.min(scenes.length - 1, index));
    scenes.forEach((scene, i) => {
      const active = i === current;
      scene.classList.toggle('active-slide', active);
      if (active) scene.tabIndex = 0;
      else scene.removeAttribute('tabindex');
    });
    scenes[current].scrollTop = 0;
    document.getElementById('slide-name').textContent = scenes[current].dataset.title;
    document.getElementById('slide-count').textContent = `${String(current + 1).padStart(2, '0')} / ${String(scenes.length).padStart(2, '0')}`;
    previous.disabled = current === 0;
    next.disabled = current === scenes.length - 1;
    queueCueUpdate();
    if (presenting) scenes[current].focus({preventScroll:true});
  }
  function setPresentation(enabled) {
    mobileNav.open = false;
    if (enabled) showSlide(0);
    presenting = enabled;
    document.body.classList.toggle('presenting', enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.querySelector('span').textContent = enabled ? 'К обзору' : 'Презентация';
    controls.hidden = !enabled;
    if (enabled) {
      window.scrollTo({top:0,behavior:'instant'});
      scenes[current].focus({preventScroll:true});
    }
    else {
      scenes.forEach(scene => scene.removeAttribute('tabindex'));
      scenes[current].scrollIntoView({behavior:'instant',block:'start'});
    }
    queueCueUpdate();
  }
  toggle.addEventListener('click', () => setPresentation(!presenting));
  previous.addEventListener('click', () => showSlide(current - 1));
  next.addEventListener('click', () => showSlide(current + 1));
  scenes.forEach(scene => {
    scene.setAttribute('aria-label', scene.dataset.title);
    scene.addEventListener('scroll', queueCueUpdate, {passive:true});
  });
  window.addEventListener('resize', queueCueUpdate, {passive:true});
  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(queueCueUpdate);
    scenes.forEach(scene => resizeObserver.observe(scene));
  }
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { mobileNav.open = false; }));
  document.addEventListener('click', event => {
    if (mobileNav.open && !mobileNav.contains(event.target)) mobileNav.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobileNav.open) {
      mobileNav.open = false;
      mobileNav.querySelector('summary').focus();
      return;
    }
    if (!presenting || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { setPresentation(false); toggle.focus(); }
    else if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); showSlide(current + 1); }
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); showSlide(current - 1); }
  });
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    if (!presenting) return;
    const index = scenes.findIndex(scene => `#${scene.id}` === link.getAttribute('href'));
    if (index >= 0) { event.preventDefault(); showSlide(index); }
  }));
})();
