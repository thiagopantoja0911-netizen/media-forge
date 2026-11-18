(()=>{const button=document.getElementById("remotionOpen");const panel=document.getElementById("remotionLayerPanel");
if(!button||!panel)return;button.addEventListener("click",()=>{panel.hidden=!panel.hidden;button.textContent=panel.hidden?"Abrir compositor Remotion · 12s":"Ocultar compositor Remotion";});
})();