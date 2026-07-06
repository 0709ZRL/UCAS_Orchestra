document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.main')?.addEventListener('click', function() {
    if (window.innerWidth <= 900) document.querySelector('.sidebar')?.classList.remove('open');
  });
  checkAuth().then(ok => {
    if (ok) loadPage('logistics');
  });
});
