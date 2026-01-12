/**
 * WIDGET CORE - TryOn Embeddable Widget
 * 
 * Este código se inyecta en sitios externos y se auto-inicializa.
 * Usa Shadow DOM para aislamiento completo.
 * NO usa frameworks externos.
 */

(function() {
  'use strict';

  // Obtener API key del script tag
  const getCurrentScript = () => {
    if (document.currentScript) {
      return document.currentScript;
    }
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].hasAttribute('data-tryon-key')) {
        return scripts[i];
      }
    }
    return null;
  };

  const script = getCurrentScript();
  const API_KEY = script ? script.getAttribute('data-tryon-key') : null;
  
  if (!API_KEY) {
    console.error('[TryOn Widget] Error: data-tryon-key no encontrado');
    return;
  }

  // Detectar URL del backend desde el src del script
  const getBackendUrl = () => {
    if (script && script.src) {
      try {
        const url = new URL(script.src);
        return url.origin;
      } catch (e) {
        // Si es URL relativa, usar el origen actual
        return window.location.origin;
      }
    }
    return window.location.origin;
  };
  
  const BACKEND_URL = getBackendUrl();

  // Evitar inicialización múltiple
  if (window.__TRYON_WIDGET_LOADED__) {
    return;
  }
  window.__TRYON_WIDGET_LOADED__ = true;

  // Estado del widget
  // generationStatus: 'idle' | 'processing' | 'completed' | 'error'
  const state = {
    isOpen: false,
    isDragging: false,
    userImage: null,
    garments: [null, null, null],
    resultImage: null,
    isGenerating: false,
    generationStatus: 'idle', // idle | processing | completed | error
    inputsUsed: null, // { baseImage: string, garments: string[] } - preserved after generation
    showOnboarding: !localStorage.getItem('tryon_onboarding_done')
  };

  // Helper: comprimir imagen a max 768px y JPEG 70%
  // Optimizado para velocidad sin afectar calidad del try-on
  function compressImage(fileOrBlob, maxSize = 768, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Calcular nuevas dimensiones
          let width = img.width;
          let height = img.height;
          
          if (width > maxSize || height > maxSize) {
            if (width > height) {
              height = Math.round((height * maxSize) / width);
              width = maxSize;
            } else {
              width = Math.round((width * maxSize) / height);
              height = maxSize;
            }
          }
          
          // Crear canvas y comprimir
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          // Convertir a JPEG comprimido
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBlob);
    });
  }

  // Helper: convertir File a base64 (legacy, usa compressImage ahora)
  function fileToBase64(file) {
    return compressImage(file);
  }

  // Crear contenedor principal
  const container = document.createElement('div');
  container.id = 'tryon-widget-root';
  document.body.appendChild(container);

  // Crear Shadow DOM
  const shadow = container.attachShadow({ mode: 'open' });

  // Estilos del widget
  const styles = `
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .tryon-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 120px;
      height: 56px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 28px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 999999;
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .tryon-fab:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .tryon-fab:active {
      transform: translateY(0);
    }

    .tryon-panel {
      /* Anchored popover - aparece arriba del FAB */
      position: fixed;
      bottom: 82px; /* 24px (FAB bottom) + 56px (FAB height) + 2px gap mínimo */
      right: 24px;
      top: auto;
      left: auto;
      width: 320px;
      max-width: calc(100vw - 48px);
      height: 480px; /* Altura fija para evitar resize */
      max-height: calc(100vh - 82px - 10px); /* Nunca exceder viewport */
      background: white;
      border-radius: 16px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      /* Animación: scale + fade desde abajo */
      transform: translateY(16px) scale(0.95);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), 
                  opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
                  top 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                  bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                  max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                  border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tryon-panel.open {
      transform: translateY(0) scale(1);
      opacity: 1;
      pointer-events: auto;
    }

    /* Panel expanded state - reaches top of viewport */
    .tryon-panel.has-result {
      top: 0;
      bottom: 82px;
      max-height: none;
      height: auto;
      border-radius: 16px;
    }

    .tryon-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      z-index: 999998;
      /* IMPORTANTE: pointer-events: none siempre para no bloquear el drag */
      pointer-events: none;
      display: none;
    }

    .tryon-overlay.show {
      display: block;
      /* NO activamos pointer-events aquí - dejamos que pasen los eventos */
      pointer-events: none;
    }

    /* Permitir drag & drop a través del overlay */
    .tryon-overlay.dragging {
      pointer-events: none !important;
    }

    .tryon-header {
      padding: 12px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      transition: opacity 0.3s, height 0.3s, padding 0.3s, border 0.3s;
    }

    /* Hide header when showing result */
    .tryon-panel.has-result .tryon-header {
      display: none;
    }

    .tryon-header h3 {
      font-size: 14px;
      color: #6b7280;
      font-weight: 500;
    }

    .tryon-close {
      background: none;
      border: none;
      font-size: 24px;
      color: #9ca3af;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      transition: background 0.2s;
    }

    .tryon-close:hover {
      background: #f3f4f6;
    }

    .tryon-body {
      padding: 16px 20px;
      overflow: hidden;
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    /* Initial UI container - fills available space */
    .tryon-initial-ui {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    /* Hide initial upload UI when showing result */
    .tryon-panel.has-result .tryon-initial-ui {
      display: none;
    }

    /* Result view takes full space but keeps padding for white border */
    .tryon-panel.has-result .tryon-body {
      padding: 20px;
      padding-bottom: 0;
      overflow: hidden;
      background: white;
    }

    .tryon-upload-box {
      border: 2px dashed #d1d5db;
      border-radius: 12px;
      padding: 12px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      background: #f9fafb;
      height: 150px;
      max-height: 150px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .tryon-upload-box:hover {
      border-color: #667eea;
      background: #f5f7ff;
    }

    .tryon-upload-box.has-image {
      padding: 4px;
      border: 2px solid #e5e7eb;
      overflow: hidden;
      background: white;
    }

    .tryon-upload-box img {
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 8px;
      display: block;
      margin: auto;
    }

    /* User photo upload box - image contained inside box */
    #user-image-box.has-image {
      overflow: hidden;
    }

    #user-image-box img {
      max-width: 100%;
      max-height: 100%;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .tryon-remove-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .tryon-remove-btn:hover {
      background: rgba(0, 0, 0, 0.9);
    }

    .tryon-label {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
      display: block;
      flex-shrink: 0;
    }

    .tryon-garments {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin: 10px 0;
      flex-shrink: 0;
    }

    .tryon-garment-box {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 6px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: #f9fafb;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      height: 80px;
      max-height: 80px;
      flex-shrink: 0;
    }

    .tryon-garment-box:hover {
      border-color: #667eea;
      background: #f5f7ff;
    }

    .tryon-garment-box.has-image {
      padding: 0;
      border: none;
    }

    .tryon-garment-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 8px;
    }

    .tryon-result-box {
      display: none;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      background: white;
    }

    .tryon-result-box.show {
      display: flex;
    }

    /* Result image container - rounded, with visible white border around */
    .tryon-result-image-container {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      position: relative;
      background: white;
      border-radius: 16px;
    }

    .tryon-result-box img {
      width: 100%;
      height: auto;
      max-height: 100%;
      object-fit: contain;
      display: block;
      cursor: zoom-in;
      transform-origin: center center;
    }

    /* Inputs Used Thumbnails - shown below result image */
    .tryon-inputs-used {
      display: none;
      padding: 16px 20px;
      background: white;
      flex-shrink: 0;
      border-top: 1px solid #e5e7eb;
    }

    .tryon-inputs-used.show {
      display: block;
    }

    .tryon-inputs-used-label {
      font-size: 11px;
      color: #6b7280;
      margin-bottom: 8px;
      display: block;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }

    .tryon-inputs-thumbnails {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .tryon-input-thumb {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      border: 2px solid #e5e7eb;
      overflow: hidden;
      flex-shrink: 0;
      background: #f9fafb;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tryon-input-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .tryon-input-thumb.empty {
      border-style: dashed;
      display: none; /* Hide empty slots in result view */
    }

    .tryon-input-thumb.empty::after {
      content: '+';
      color: #d1d5db;
      font-size: 20px;
    }

    /* Close button floating on result view */
    .tryon-result-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, transform 0.2s;
      z-index: 10;
      backdrop-filter: blur(4px);
    }

    .tryon-result-close:hover {
      background: rgba(0, 0, 0, 0.8);
      transform: scale(1.1);
    }

    /* Submit button states */
    .tryon-submit-btn.processing {
      background: #9ca3af;
      cursor: wait;
    }

    .tryon-submit-btn.completed {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    }

    .tryon-footer {
      padding: 12px 20px;
      border-top: 1px solid #e5e7eb;
      flex-shrink: 0;
      background: white;
    }

    /* Footer visible in result view for 'Try Another Look' button */
    .tryon-panel.has-result .tryon-footer {
      display: block !important;
      border-top: 1px solid #e5e7eb;
    }

    .tryon-submit-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .tryon-submit-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .tryon-submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .tryon-loader {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .tryon-onboarding {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 1000001;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .tryon-onboarding-content {
      background: white;
      border-radius: 16px;
      padding: 32px;
      max-width: 400px;
      text-align: center;
    }

    .tryon-onboarding h2 {
      font-size: 24px;
      color: #111827;
      margin-bottom: 16px;
    }

    .tryon-onboarding p {
      font-size: 16px;
      color: #6b7280;
      line-height: 1.6;
      margin-bottom: 24px;
    }

    .tryon-onboarding button {
      padding: 12px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }

    input[type="file"] {
      display: none;
    }
  `;

  // HTML del widget
  const html = `
    <style>${styles}</style>
    
    <button class="tryon-fab" id="tryon-fab">
      ✨ Try look
    </button>

    <div class="tryon-overlay" id="tryon-overlay"></div>

    <div class="tryon-panel" id="tryon-panel" style="display: none;">
      <div class="tryon-header">
        <h3>Powered by TryOn.com</h3>
        <button class="tryon-close" id="tryon-close">×</button>
      </div>

      <div class="tryon-body">
        <!-- Initial upload UI - hidden after first generation -->
        <div class="tryon-initial-ui">
          <label class="tryon-label">Upload your photo</label>
          <div class="tryon-upload-box" id="user-image-box">
            <div id="user-image-placeholder">
              <div style="font-size: 48px; margin-bottom: 12px;">📸</div>
              <div style="font-size: 14px; color: #6b7280;">Click or drag to upload</div>
            </div>
            <input type="file" id="user-image-input" accept="image/*">
          </div>

          <label class="tryon-label" style="margin-top: 24px;">Add garments (up to 3)</label>
          <div class="tryon-garments">
            <div class="tryon-garment-box" data-index="0">
              <div>👕</div>
              <input type="file" id="garment-input-0" accept="image/*">
            </div>
            <div class="tryon-garment-box" data-index="1">
              <div>👔</div>
              <input type="file" id="garment-input-1" accept="image/*">
            </div>
            <div class="tryon-garment-box" data-index="2">
              <div>👗</div>
              <input type="file" id="garment-input-2" accept="image/*">
            </div>
          </div>
        </div>

        <!-- Result view - shown after generation -->
        <div class="tryon-result-box" id="result-box">
          <div class="tryon-result-image-container">
            <button class="tryon-result-close" id="result-close">×</button>
            <img id="result-image" alt="Generated result">
          </div>
        </div>
      </div>

      <!-- Thumbnails section - shown after generation, outside body for proper stacking -->
      <div class="tryon-inputs-used" id="inputs-used">
        <span class="tryon-inputs-used-label">Images used</span>
        <div class="tryon-inputs-thumbnails" id="inputs-thumbnails">
          <!-- Populated dynamically: 1 base + garments -->
        </div>
      </div>

      <div class="tryon-footer">
        <button class="tryon-submit-btn" id="submit-btn" disabled>
          Try look
        </button>
      </div>
    </div>

    <div class="tryon-onboarding" id="onboarding" style="display: none;">
      <div class="tryon-onboarding-content">
        <h2>Welcome to TryOn! 👋</h2>
        <p>Upload your photo and add garments to see how they look on you. It's that simple!</p>
        <button id="onboarding-done">Got it!</button>
      </div>
    </div>
  `;

  shadow.innerHTML = html;

  // Referencias a elementos
  const fab = shadow.getElementById('tryon-fab');
  const overlay = shadow.getElementById('tryon-overlay');
  const panel = shadow.getElementById('tryon-panel');
  const closeBtn = shadow.getElementById('tryon-close');
  const userImageBox = shadow.getElementById('user-image-box');
  const userImageInput = shadow.getElementById('user-image-input');
  const userImagePlaceholder = shadow.getElementById('user-image-placeholder');
  const submitBtn = shadow.getElementById('submit-btn');
  const resultBox = shadow.getElementById('result-box');
  const resultImage = shadow.getElementById('result-image');
  const resultCloseBtn = shadow.getElementById('result-close');
  const onboarding = shadow.getElementById('onboarding');
  const onboardingDone = shadow.getElementById('onboarding-done');
  const inputsUsed = shadow.getElementById('inputs-used');
  const inputsThumbnails = shadow.getElementById('inputs-thumbnails');

  // Zoom dinámico 2x en la imagen de resultado
  resultImage.addEventListener('mousemove', (e) => {
    const rect = resultImage.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    resultImage.style.transformOrigin = `${x}% ${y}%`;
    resultImage.style.transform = 'scale(2)';
  });

  resultImage.addEventListener('mouseleave', () => {
    resultImage.style.transform = 'scale(1)';
    resultImage.style.transformOrigin = 'center center';
  });

  // Funciones
  function openWidget() {
    state.isOpen = true;
    overlay.style.display = 'block';
    panel.style.display = 'flex';
    // Forzar reflow para que la transición funcione
    panel.offsetHeight;
    overlay.classList.add('show');
    panel.classList.add('open');

    if (state.showOnboarding) {
      onboarding.style.display = 'flex';
    }
  }

  function closeWidget() {
    state.isOpen = false;
    overlay.classList.remove('show');
    panel.classList.remove('open');
    setTimeout(() => {
      overlay.style.display = 'none';
      panel.style.display = 'none';
    }, 300);
  }

  function updateSubmitButton() {
    // Only update if not in processing state
    if (state.generationStatus === 'processing') return;
    
    const hasUserImage = state.userImage !== null;
    const hasGarment = state.garments.some(g => g !== null);
    
    if (state.generationStatus === 'completed') {
      // Keep "Try another look" state
      submitBtn.textContent = 'Try another look';
      submitBtn.disabled = false;
      submitBtn.classList.add('completed');
    } else {
      submitBtn.textContent = 'Try Look';
      submitBtn.disabled = !hasUserImage || !hasGarment;
      submitBtn.classList.remove('completed');
    }
  }

  function handleUserImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) return;

    fileToBase64(file).then(base64 => {
      state.userImage = base64;
      
      userImageBox.classList.add('has-image');
      userImagePlaceholder.innerHTML = `
        <img src="${base64}" alt="User photo">
        <button class="tryon-remove-btn" id="remove-user-image">×</button>
      `;

      const removeBtn = shadow.getElementById('remove-user-image');
      removeBtn.onclick = () => {
        state.userImage = null;
        userImageBox.classList.remove('has-image');
        userImagePlaceholder.innerHTML = `
          <div style="font-size: 48px; margin-bottom: 12px;">📸</div>
          <div style="font-size: 14px; color: #6b7280;">Click or drag to upload</div>
        `;
        updateSubmitButton();
      };

      updateSubmitButton();
    });
  }

  function handleGarmentUpload(file, index) {
    if (!file || !file.type.startsWith('image/')) return;

    fileToBase64(file).then(base64 => {
      state.garments[index] = base64;
      
      const box = shadow.querySelector(`.tryon-garment-box[data-index="${index}"]`);
      box.classList.add('has-image');
      box.innerHTML = `
        <img src="${base64}" alt="Garment">
        <button class="tryon-remove-btn remove-garment" data-index="${index}">×</button>
      `;

      const removeBtn = box.querySelector('.remove-garment');
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        state.garments[index] = null;
        box.classList.remove('has-image');
        box.innerHTML = `<div>👕</div>`;
        setupGarmentBox(box, index);
        updateSubmitButton();
      };

      updateSubmitButton();
    });
  }

  function setupGarmentBox(box, index) {
    const input = shadow.getElementById(`garment-input-${index}`);
    
    box.onclick = () => input.click();
    
    input.onchange = (e) => {
      if (e.target.files[0]) {
        handleGarmentUpload(e.target.files[0], index);
      }
    };

    box.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.style.borderColor = '#667eea';
      box.style.background = '#f0f4ff';
    };

    box.ondragleave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.style.borderColor = '#d1d5db';
      box.style.background = '#f9fafb';
    };

    box.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.style.borderColor = '#d1d5db';
      box.style.background = '#f9fafb';
      
      // Primero intentar archivos locales
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleGarmentUpload(e.dataTransfer.files[0], index);
        return;
      }
      
      // Si no hay archivos, buscar URL de imagen (arrastrada desde web)
      const html = e.dataTransfer.getData('text/html');
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      
      // Extraer src de imagen si viene como HTML
      let imageUrl = null;
      if (html) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match && match[1]) {
          imageUrl = match[1];
        }
      }
      
      // Si no encontramos en HTML, usar la URL directa
      if (!imageUrl && url && (url.match(/\.(jpg|jpeg|png|gif|webp)/i) || url.startsWith('data:'))) {
        imageUrl = url;
      }
      
      if (imageUrl) {
        handleGarmentFromUrl(imageUrl, index);
      }
    };
  }

  // Nuevo: Manejar garment desde URL (arrastrado desde ecommerce)
  async function handleGarmentFromUrl(url, index) {
    try {
      console.log('[TryOn Widget] Loading garment from URL:', url.slice(0, 100));
      
      // Si ya es base64, usarlo directamente
      if (url.startsWith('data:')) {
        state.garments[index] = url;
        renderGarmentImage(url, index);
        return;
      }
      
      // Descargar la imagen y convertir a base64
      const response = await fetch(url);
      const blob = await response.blob();
      
      // Comprimir la imagen
      const base64 = await compressImage(blob);
      state.garments[index] = base64;
      renderGarmentImage(base64, index);
      
    } catch (error) {
      console.error('[TryOn Widget] Error loading image from URL:', error);
      // Si falla la descarga, intentar usar la URL directamente
      state.garments[index] = url;
      renderGarmentImage(url, index);
    }
  }

  function renderGarmentImage(src, index) {
    const box = shadow.querySelector(`.tryon-garment-box[data-index="${index}"]`);
    box.classList.add('has-image');
    box.innerHTML = `
      <img src="${src}" alt="Garment">
      <button class="tryon-remove-btn remove-garment" data-index="${index}">×</button>
    `;

    const removeBtn = box.querySelector('.remove-garment');
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      state.garments[index] = null;
      box.classList.remove('has-image');
      box.innerHTML = `<div>👕</div>`;
      setupGarmentBox(box, index);
      updateSubmitButton();
    };

    updateSubmitButton();
  }

  /**
   * Renders the thumbnails showing inputs used for generation
   */
  function renderInputsUsed() {
    if (!state.inputsUsed) {
      inputsUsed.classList.remove('show');
      return;
    }

    let html = '';
    
    // Base image thumbnail (original photo)
    if (state.inputsUsed.baseImage) {
      html += `<div class="tryon-input-thumb" title="Original photo"><img src="${state.inputsUsed.baseImage}" alt="Base"></div>`;
    }
    
    // Garment thumbnails (only show ones with images)
    for (let i = 0; i < 3; i++) {
      const garment = state.inputsUsed.garments[i];
      if (garment) {
        html += `<div class="tryon-input-thumb" title="Garment ${i + 1}"><img src="${garment}" alt="Garment ${i + 1}"></div>`;
      }
    }
    
    inputsThumbnails.innerHTML = html;
    inputsUsed.classList.add('show');
  }

  /**
   * Resets the result view and returns to initial upload UI
   */
  function resetResultView() {
    state.generationStatus = 'idle';
    state.resultImage = null;
    state.inputsUsed = null;
    resultBox.classList.remove('show');
    inputsUsed.classList.remove('show');
    panel.classList.remove('has-result');
    updateGenerationUI();
  }

  /**
   * Updates UI based on current generation status
   */
  function updateGenerationUI() {
    submitBtn.classList.remove('processing', 'completed');
    
    switch (state.generationStatus) {
      case 'idle':
        submitBtn.textContent = 'Try Look';
        submitBtn.disabled = !state.userImage || !state.garments.some(g => g !== null);
        break;
        
      case 'processing':
        submitBtn.classList.add('processing');
        submitBtn.innerHTML = `<div class="tryon-loader"></div><span style="margin-left:8px;font-size:12px;">Processing…</span>`;
        submitBtn.disabled = true;
        break;
        
      case 'completed':
        submitBtn.classList.add('completed');
        submitBtn.textContent = 'Try another look';
        submitBtn.disabled = false;
        panel.classList.add('has-result');
        break;
        
      case 'error':
        submitBtn.textContent = 'Try Look';
        submitBtn.disabled = false;
        break;
    }
  }

  // Pre-upload image to FAL CDN for faster generation
  // Returns URL if successful, null if failed (falls back to base64)
  async function preUploadImage(base64Image) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/images/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: API_KEY,
          image: base64Image
        })
      });
      
      if (!response.ok) {
        console.warn('[TryOn Widget] Pre-upload failed, using base64 fallback');
        return null;
      }
      
      const data = await response.json();
      return data.url || null;
    } catch (error) {
      console.warn('[TryOn Widget] Pre-upload error:', error);
      return null; // Fallback to base64
    }
  }

  // === TIMING INSTRUMENTATION ===
  function generateRequestId() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function logTiming(requestId, phase, metadata = {}) {
    const now = Date.now();
    const entry = {
      level: 'info',
      type: 'timing',
      request_id: requestId,
      source: 'frontend',
      phase: phase,
      timestamp_iso: new Date(now).toISOString(),
      timestamp_ms: now,
      metadata: metadata
    };
    console.log('[TryOn Timing]', JSON.stringify(entry));
    return now;
  }

  async function generateImage() {
    // If already completed, "Try another look" resets and returns to initial UI
    if (state.generationStatus === 'completed') {
      resetResultView();
      return;
    }

    if (state.isGenerating) return;

    // === T0: Click timestamp ===
    const requestId = generateRequestId();
    const timings = {};
    timings.t0_click = logTiming(requestId, 'click');

    state.isGenerating = true;
    state.generationStatus = 'processing';
    updateGenerationUI();
    
    // Preserve current inputs for thumbnails
    const currentGarments = state.garments.filter(g => g !== null);
    state.inputsUsed = {
      baseImage: state.userImage,
      garments: [...state.garments] // Keep all 3 slots (including nulls)
    };

    try {
      // === T1: Pre-upload start ===
      timings.t1_preupload_start = logTiming(requestId, 'preupload_start', { garments_count: currentGarments.length });

      // Pre-upload images to CDN in parallel for faster generation
      // Falls back to base64 if pre-upload fails
      const uploadPromises = [
        preUploadImage(state.userImage),
        ...currentGarments.map(g => preUploadImage(g))
      ];
      
      const uploadedUrls = await Promise.all(uploadPromises);
      const userImageUrl = uploadedUrls[0] || state.userImage;
      const garmentUrls = uploadedUrls.slice(1).map((url, i) => url || currentGarments[i]);
      
      // === T2: Pre-upload end ===
      const preuploadSuccess = uploadedUrls.filter(u => u !== null).length;
      timings.t2_preupload_end = logTiming(requestId, 'preupload_end', { 
        preupload_success: preuploadSuccess,
        preupload_total: uploadedUrls.length,
        duration_ms: Date.now() - timings.t1_preupload_start
      });
      
      const payload = {
        apiKey: API_KEY,
        userImage: userImageUrl,
        garments: garmentUrls,
        // Pass request_id to backend for correlation
        _requestId: requestId,
        _feClickTs: timings.t0_click
      };

      // Calculate payload size
      const payloadStr = JSON.stringify(payload);
      const payloadSizeKb = Math.round(payloadStr.length / 1024);
      
      // === T3: Request sent ===
      timings.t3_request_sent = logTiming(requestId, 'request_sent', { payload_size_kb: payloadSizeKb });
      
      const response = await fetch(`${BACKEND_URL}/api/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr
      });

      // === T10: Response received ===
      timings.t10_response_received = logTiming(requestId, 'response_received', {
        status: response.status,
        duration_ms: Date.now() - timings.t3_request_sent
      });

      if (!response.ok) {
        throw new Error('Generation failed');
      }

      const data = await response.json();
      
      if (data.resultImage) {
        // === T11: Render start ===
        timings.t11_render_start = logTiming(requestId, 'render_start');

        state.resultImage = data.resultImage;
        state.generationStatus = 'completed';
        
        // Wait for image to actually load before marking render done
        await new Promise((resolve, reject) => {
          resultImage.onload = resolve;
          resultImage.onerror = reject;
          resultImage.src = data.resultImage;
        });

        // === T12: Render done ===
        timings.t12_render_done = logTiming(requestId, 'render_done', {
          render_duration_ms: Date.now() - timings.t11_render_start
        });

        resultBox.classList.add('show');
        renderInputsUsed();

        // === Final summary log ===
        const totalDuration = timings.t12_render_done - timings.t0_click;
        logTiming(requestId, 'e2e_complete', {
          total_duration_ms: totalDuration,
          preupload_ms: timings.t2_preupload_end - timings.t1_preupload_start,
          network_round_trip_ms: timings.t10_response_received - timings.t3_request_sent,
          render_ms: timings.t12_render_done - timings.t11_render_start,
          // Backend timings from response if available
          backend_timings: data.metadata?.timings || null
        });
      } else {
        throw new Error('No result image returned');
      }

    } catch (error) {
      console.error('[TryOn Widget] Generation error:', error);
      logTiming(requestId, 'error', { error: error.message });
      state.generationStatus = 'error';
      state.inputsUsed = null;
      alert('Error generating image. Please try again.');
    } finally {
      state.isGenerating = false;
      updateGenerationUI();
    }
  }

  // Event listeners
  // El panel SOLO se cierra con el botón X o el FAB, nunca por clicks fuera
  fab.onclick = () => state.isOpen ? closeWidget() : openWidget();
  closeBtn.onclick = closeWidget;
  resultCloseBtn.onclick = resetResultView; // Close result view and return to upload UI
  
  submitBtn.onclick = generateImage;

  // Detectar drag & drop global para evitar cierre accidental
  document.addEventListener('dragstart', () => {
    state.isDragging = true;
    overlay.classList.add('dragging');
  });
  
  document.addEventListener('dragend', () => {
    // Pequeño delay para que el click no se dispare inmediatamente
    setTimeout(() => {
      state.isDragging = false;
      overlay.classList.remove('dragging');
    }, 100);
  });

  // También detectar drag desde fuera del documento (imágenes externas)
  document.addEventListener('dragenter', (e) => {
    state.isDragging = true;
    overlay.classList.add('dragging');
  });

  document.addEventListener('dragleave', (e) => {
    // Solo resetear si salimos completamente del documento
    if (!e.relatedTarget && e.clientX === 0 && e.clientY === 0) {
      setTimeout(() => {
        state.isDragging = false;
        overlay.classList.remove('dragging');
      }, 100);
    }
  });

  document.addEventListener('drop', () => {
    setTimeout(() => {
      state.isDragging = false;
      overlay.classList.remove('dragging');
    }, 100);
  });

  // Prevenir que el panel cierre cuando se arrastra sobre él
  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  panel.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  panel.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  userImageBox.onclick = () => userImageInput.click();
  userImageInput.onchange = (e) => {
    if (e.target.files[0]) {
      handleUserImageUpload(e.target.files[0]);
    }
  };

  userImageBox.ondragover = (e) => {
    e.preventDefault();
    userImageBox.style.borderColor = '#667eea';
  };

  userImageBox.ondragleave = () => {
    userImageBox.style.borderColor = '#d1d5db';
  };

  userImageBox.ondrop = (e) => {
    e.preventDefault();
    userImageBox.style.borderColor = '#d1d5db';
    if (e.dataTransfer.files[0]) {
      handleUserImageUpload(e.dataTransfer.files[0]);
    }
  };

  // Setup garment boxes
  for (let i = 0; i < 3; i++) {
    const box = shadow.querySelector(`.tryon-garment-box[data-index="${i}"]`);
    setupGarmentBox(box, i);
  }

  // Onboarding
  onboardingDone.onclick = () => {
    localStorage.setItem('tryon_onboarding_done', 'true');
    state.showOnboarding = false;
    onboarding.style.display = 'none';
  };

  console.log('[TryOn Widget] Initialized successfully');
})();
