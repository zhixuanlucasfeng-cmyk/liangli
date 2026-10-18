// Run before the stylesheet so a remembered night theme never flashes white.
(() => {
  const key='powvy-habit-theme',system=matchMedia('(prefers-color-scheme: dark)');
  let choice;
  try{choice=localStorage.getItem(key);}catch{}
  if(!['light','dark'].includes(choice))choice=null;
  function refresh(){
    const dark=(choice|| (system.matches?'dark':'light'))==='dark';
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#191c1d':'#ded9cd');
    const button=document.getElementById('themeToggle');
    if(button)button.setAttribute('aria-pressed',String(dark));
  }
  window.PowvyTheme={refresh,toggle(){
    choice=document.documentElement.dataset.theme==='dark'?'light':'dark';
    refresh();
    try{localStorage.setItem(key,choice);}catch{
      if(typeof toast==='function')toast(document.documentElement.lang.startsWith('zh')?'主题已切换，但无法保存偏好。':'Theme changed, but the preference could not be saved.');
    }
  }};
  system.addEventListener('change',()=>{if(!choice)refresh();});
  refresh();
})();
