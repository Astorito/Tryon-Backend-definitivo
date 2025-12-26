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
  const state = {
    isOpen: false,
    userImage: null,
    garments: [null, null, null],
    resultImage: null,
    isGenerating: false,
    showOnboarding: !localStorage.getItem('tryon_onboarding_done')
  };

  // Helper: comprimir imagen a max 1024px y JPEG 80%
  function compressImage(file, maxSize = 1024, quality = 0.8) {
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
          console.log('[TryOn Widget] Imagen comprimida:', 
            Math.round(file.size / 1024) + 'KB →', 
            Math.round(compressed.length * 0.75 / 1024) + 'KB');
          resolve(compressed);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
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
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: auto;
      transform: translateX(100%);
      width: 440px;
      max-width: 100vw;
      height: 100vh;
      max-height: 100vh;
      background: white;
      border-radius: 0;
      border-left: 1px solid #e5e7eb;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
      z-index: 1000000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .tryon-panel.open {
      transform: translateX(0);
    }

    .tryon-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: transparent;
      z-index: 999998;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
    }

    .tryon-overlay.show {
      opacity: 1;
      pointer-events: none;
    }

    .tryon-header {
      padding: 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
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
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .tryon-upload-box {
      border: 2px dashed #d1d5db;
      border-radius: 12px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
      background: #f9fafb;
      min-height: 200px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .tryon-upload-box:hover {
      border-color: #667eea;
      background: #f5f7ff;
    }

    .tryon-upload-box.has-image {
      padding: 0;
      border: none;
      min-height: auto;
    }

    .tryon-upload-box img {
      max-width: 100%;
      max-height: 300px;
      border-radius: 12px;
      display: block;
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
      font-size: 14px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 12px;
      display: block;
    }

    .tryon-garments {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin: 20px 0;
    }

    .tryon-garment-box {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 20px 10px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: #f9fafb;
      aspect-ratio: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      min-height: 120px;
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
      margin-top: 24px;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
      display: none;
    }

    .tryon-result-box.show {
      display: block;
    }

    .tryon-result-box img {
      width: 100%;
      height: auto;
      display: block;
      transition: transform 0.3s;
      cursor: zoom-in;
    }

    .tryon-result-box img:hover {
      transform: scale(1.05);
    }

    .tryon-footer {
      padding: 20px 24px;
      border-top: 1px solid #e5e7eb;
    }

    .tryon-submit-btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
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

        <div class="tryon-result-box" id="result-box">
          <img id="result-image" alt="Generated result">
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
  const onboarding = shadow.getElementById('onboarding');
  const onboardingDone = shadow.getElementById('onboarding-done');

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
    const hasUserImage = state.userImage !== null;
    const hasGarment = state.garments.some(g => g !== null);
    submitBtn.disabled = !hasUserImage || !hasGarment;
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
      box.style.borderColor = '#667eea';
    };

    box.ondragleave = () => {
      box.style.borderColor = '#d1d5db';
    };

    box.ondrop = (e) => {
      e.preventDefault();
      box.style.borderColor = '#d1d5db';
      if (e.dataTransfer.files[0]) {
        handleGarmentUpload(e.dataTransfer.files[0], index);
      }
    };
  }

  async function generateImage() {
    if (state.isGenerating) return;

    state.isGenerating = true;
    submitBtn.disabled = true;
    
    // Feedback visual con etapas
    const updateStatus = (text) => {
      submitBtn.innerHTML = `<div class="tryon-loader"></div><span style="margin-left:8px;font-size:12px;">${text}</span>`;
    };
    
    updateStatus('Subiendo...');

    try {
      const payload = {
        apiKey: API_KEY,
        userImage: state.userImage,
        garments: state.garments.filter(g => g !== null)
      };

      updateStatus('Procesando...');
      
      const response = await fetch(`${BACKEND_URL}/api/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Generation failed');
      }

      const data = await response.json();
      
      if (data.resultImage) {
        state.resultImage = data.resultImage;
        resultImage.src = data.resultImage;
        resultBox.classList.add('show');
      }

    } catch (error) {
      console.error('[TryOn Widget] Generation error:', error);
      alert('Error generating image. Please try again.');
    } finally {
      state.isGenerating = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Try look';
    }
  }

  // Event listeners
  fab.onclick = openWidget;
  closeBtn.onclick = closeWidget;
  overlay.onclick = closeWidget;
  submitBtn.onclick = generateImage;

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
