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

  /**
   * Optimiza imagen específicamente para inferencia IA
   * Reduce resolución a lo que el modelo realmente necesita
   */
  async function optimizeForInference(base64Image) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resolución óptima para FAL virtual try-on
        const TARGET_HEIGHT = 768;  // Altura ideal para modelo
        const TARGET_WIDTH = 512;   // Ancho proporcional
        
        let width = img.width;
        let height = img.height;
        
        // Calcular nuevo tamaño manteniendo aspect ratio
        const aspectRatio = width / height;
        
        if (height > TARGET_HEIGHT) {
          height = TARGET_HEIGHT;
          width = Math.round(height * aspectRatio);
        }
        
        // Si el ancho es muy grande, limitarlo también
        if (width > TARGET_WIDTH * 1.5) {
          width = TARGET_WIDTH * 1.5;
          height = Math.round(width / aspectRatio);
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Render con suavizado de alta calidad
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        
        // JPEG quality 0.75 es suficiente para IA
        const optimized = canvas.toDataURL('image/jpeg', 0.75);
        
        // Log para debugging
        const originalSize = Math.round(base64Image.length / 1024);
        const optimizedSize = Math.round(optimized.length / 1024);
        console.log(`[TryOn] Image optimized: ${originalSize}KB → ${optimizedSize}KB (${Math.round((1 - optimizedSize/originalSize) * 100)}% reduction)`);
        
        resolve(optimized);
      };
      img.onerror = () => {
        console.error('[TryOn] Error loading image for optimization');
        resolve(base64Image); // Fallback a original
      };
      img.src = base64Image;
    });
  }

  // Helper: convertir File a base64 (legacy, usa compressImage ahora)
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Sistema de progress con stages realistas
   */
  function createProgressUpdater() {
    const stages = [
      { ms: 0,    msg: "🔍 Analyzing...", progress: 10, step: 0 },
      { ms: 700,  msg: "👔 Adjusting garments...", progress: 30, step: 1 },
      { ms: 1400, msg: "🎨 Applying textures...", progress: 50, step: 2 },
      { ms: 2100, msg: "✨ Last details...", progress: 70, step: 2 },
      { ms: 2800, msg: "🎯 Almost ready...", progress: 90, step: 3 },
    ];
    
    let currentStage = 0;
    let intervalId = null;
    
    function start() {
      // Mostrar progress container
      const container = shadow.getElementById('tryon-progress-container');
      if (container) {
        container.style.display = 'block';
      }
      
      // Ocultar otros elementos si es necesario
      const resultBox = shadow.getElementById('tryon-result-box');
      if (resultBox) {
        resultBox.style.display = 'none';
      }
      
      // Iniciar updates
      currentStage = 0;
      intervalId = setInterval(() => {
        if (currentStage < stages.length) {
          const stage = stages[currentStage];
          updateUI(stage);
          currentStage++;
        }
      }, 700);
    }
    
    function updateUI(stage) {
      // Update message
      const message = shadow.getElementById('tryon-progress-message');
      if (message) {
        message.textContent = stage.msg;
      }
      
      // Update progress bar
      const bar = shadow.getElementById('tryon-progress-bar');
      if (bar) {
        bar.style.width = `${stage.progress}%`;
      }
      
      // Update active step
      const steps = shadow.querySelectorAll('.tryon-step');
      steps.forEach((step, index) => {
        if (index === stage.step) {
          step.classList.add('active');
        } else if (index < stage.step) {
          step.style.background = 'rgba(124, 58, 237, 0.15)';
        }
      });
    }
    
    function complete() {
      if (intervalId) {
        clearInterval(intervalId);
      }
      
      // Animación final
      updateUI({ msg: "✅ ¡Listo!", progress: 100, step: 3 });
      
      // Ocultar después de 500ms
      setTimeout(() => {
        const container = shadow.getElementById('tryon-progress-container');
        if (container) {
          container.style.display = 'none';
        }
      }, 500);
    }
    
    function cancel() {
      if (intervalId) {
        clearInterval(intervalId);
      }
      const container = shadow.getElementById('tryon-progress-container');
      if (container) {
        container.style.display = 'none';
      }
    }
    
    return { start, complete, cancel };
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
      display: flex;
      flex-direction: column;
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

    /* Keep header visible when showing result */
    .tryon-panel.has-result .tryon-header {
      display: flex;
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

    /* Result view takes full space */
    .tryon-panel.has-result .tryon-body {
      padding: 16px 20px;
      overflow: hidden;
      background: white;
      display: flex;
      flex-direction: column;
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
      padding: 0;
      border: 2px solid #e5e7eb;
      overflow: hidden;
      background: #f3f4f6;
    }

    .tryon-upload-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 8px;
      display: block;
    }

    /* User photo upload box - image contained inside box */
    #user-image-box.has-image {
      overflow: hidden;
    }

    #user-image-box img {
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

    /* Hidden file inputs */
    #user-image-input {
      display: none !important;
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

    /* Result image container - rounded box with border */
    .tryon-result-image-container {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      position: relative;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 16px;
      padding: 8px;
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
      padding: 12px 20px 0 20px;
      background: white;
      flex-shrink: 0;
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
      gap: 10px;
      overflow-x: auto;
      padding-bottom: 4px;
      justify-content: flex-start;
    }

    .tryon-input-thumb {
      width: 60px;
      height: 60px;
      border-radius: 12px;
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
      cursor: pointer;
    }

    .tryon-input-thumb.empty:hover {
      border-color: #667eea;
      background: #f5f7ff;
    }

    .tryon-input-thumb.empty::after {
      content: '+';
      color: #9ca3af;
      font-size: 20px;
    }

    .tryon-input-thumb.empty:hover::after {
      color: #667eea;
    }

    /* Close button floating on result view */
    .tryon-result-close {
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.6);
      color: white;
      border: none;
      width: 32px;
      height: 32px;
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

    /* Keep footer visible in result view */
    .tryon-panel.has-result .tryon-footer {
      display: block !important;
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

    @keyframes tryon-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }
    
    .tryon-step.active {
      background: rgba(124, 58, 237, 0.3) !important;
      color: white !important;
      transform: scale(1.1);
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
          </div>
          <input type="file" id="user-image-input" accept="image/*" style="display: none;">

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

        <!-- Progress view - shown during generation -->
        <div id="tryon-progress-container" style="display: none; padding: 32px; text-align: center;">
          <!-- Progress Bar -->
          <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 8px; overflow: hidden; margin-bottom: 16px;">
            <div id="tryon-progress-bar" style="
              height: 100%;
              width: 0%;
              background: linear-gradient(90deg, #7c3aed, #ec4899);
              border-radius: 8px;
              transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
              box-shadow: 0 0 20px rgba(124, 58, 237, 0.5);
            "></div>
          </div>
          
          <!-- Message -->
          <p id="tryon-progress-message" style="
            font-size: 18px;
            font-weight: 600;
            color: #fff;
            margin-bottom: 24px;
            animation: tryon-pulse 2s ease-in-out infinite;
          ">
            🚀 Iniciando...
          </p>
          
          <!-- Steps -->
          <div id="tryon-progress-steps" style="
            display: flex;
            justify-content: center;
            gap: 12px;
            flex-wrap: wrap;
          ">
            <span class="tryon-step" data-step="0" style="
              padding: 8px 16px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 16px;
              font-size: 12px;
              color: rgba(255, 255, 255, 0.5);
              transition: all 0.3s;
            ">Analizar</span>
            <span class="tryon-step" data-step="1" style="
              padding: 8px 16px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 16px;
              font-size: 12px;
              color: rgba(255, 255, 255, 0.5);
              transition: all 0.3s;
            ">Ajustar</span>
            <span class="tryon-step" data-step="2" style="
              padding: 8px 16px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 16px;
              font-size: 12px;
              color: rgba(255, 255, 255, 0.5);
              transition: all 0.3s;
            ">Aplicar</span>
            <span class="tryon-step" data-step="3" style="
              padding: 8px 16px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 16px;
              font-size: 12px;
              color: rgba(255, 255, 255, 0.5);
              transition: all 0.3s;
            ">Finalizar</span>
          </div>
        </div>

        <!-- Result view - shown after generation -->
        <div class="tryon-result-box" id="result-box">
          <div class="tryon-result-image-container">
            <button class="tryon-result-close" id="result-close">×</button>
            <img id="result-image" alt="Generated result">
          </div>
          <!-- Thumbnails section - shown after generation at bottom -->
          <div class="tryon-inputs-used" id="inputs-used">
            <div class="tryon-inputs-thumbnails" id="inputs-thumbnails">
              <!-- Populated dynamically: garments + empty button -->
            </div>
          </div>
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

  // Event listeners principales
  fab.addEventListener('click', openWidget);
  closeBtn.addEventListener('click', closeWidget);
  resultCloseBtn.addEventListener('click', resetToInitial);
  
  function resetToInitial() {
    // Reset state
    state.generationStatus = 'idle';
    state.resultImage = null;
    
    // Hide result
    resultBox.style.display = 'none';
    panel.classList.remove('has-result');
    
    // Clear and hide thumbnails
    inputsThumbnails.innerHTML = '';
    inputsUsed.classList.remove('show');
    
    // Update button
    updateSubmitButton();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeWidget();
  });

  // Event listener para el botón de submit
  submitBtn.addEventListener('click', async () => {
    if (state.generationStatus === 'processing') return;
    
    const hasUserImage = state.userImage !== null;
    const hasGarments = state.garments.some(g => g !== null);
    
    if (!hasUserImage || !hasGarments) {
      alert('Please upload both your photo and at least one garment image.');
      return;
    }

    state.generationStatus = 'processing';
    submitBtn.textContent = 'Generating...';
    submitBtn.disabled = true;

    // Iniciar progress updater
    const progressUpdater = createProgressUpdater();
    progressUpdater.start();

    try {
      // Optimizar imágenes ANTES de enviar
      console.log('[TryOn] Optimizing images for AI inference...');
      const optimizeStart = performance.now();

      const userImageOptimized = await optimizeForInference(state.userImage);
      const garmentImages = state.garments.filter(g => g !== null);
      const garmentsOptimized = await Promise.all(
        garmentImages.map(g => optimizeForInference(g))
      );

      const optimizeTime = Math.round(performance.now() - optimizeStart);
      console.log(`[TryOn] Optimization completed in ${optimizeTime}ms`);

      const response = await fetch(`${BACKEND_URL}/api/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: API_KEY,
          userImage: userImageOptimized,
          garments: garmentsOptimized
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[TryOn] Response received:', result);
      
      // Completar progress updater
      progressUpdater.complete();
      
      if (result.success && result.resultImage) {
        // Store result
        state.resultImage = result.resultImage;
        state.generationStatus = 'completed';
        
        // Show result image
        resultImage.src = result.resultImage;
        resultBox.style.display = 'flex';
        
        // Update panel to result mode
        panel.classList.add('has-result');
        
        // Populate thumbnails with garments + empty button
        const usedGarments = state.garments.filter(g => g !== null);
        inputsThumbnails.innerHTML = usedGarments.map(garment => 
          `<div class="tryon-input-thumb"><img src="${garment}" alt="Garment"></div>`
        ).join('') + '<div class="tryon-input-thumb empty" id="add-more-btn"></div>';
        
        // Show thumbnails section
        inputsUsed.classList.add('show');
        
        // Add click handler to empty button
        const addMoreBtn = shadow.getElementById('add-more-btn');
        if (addMoreBtn) {
          addMoreBtn.addEventListener('click', resetToInitial);
        }
        
        // Hide onboarding after first generation
        if (state.showOnboarding) {
          state.showOnboarding = false;
          onboarding.style.display = 'none';
        }
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error) {
      progressUpdater.cancel();
      console.error('[TryOn] Generation error:', error);
      alert(`Error: ${error.message}`);
      state.generationStatus = 'idle';
    } finally {
      updateSubmitButton();
    }
  });

  // Setup onboarding
  onboardingDone.addEventListener('click', () => {
    state.showOnboarding = false;
    onboarding.style.display = 'none';
  });

  // Setup user image upload
  console.log('[TryOn] Setting up user image upload...');
  console.log('[TryOn] userImageBox:', userImageBox);
  console.log('[TryOn] userImageInput:', userImageInput);
  
  userImageBox.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[TryOn] User image box clicked');
    console.log('[TryOn] Triggering input click...');
    userImageInput.click();
    console.log('[TryOn] Input click triggered');
  });
  userImageBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    userImageBox.classList.add('drag-over');
  });
  userImageBox.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    userImageBox.classList.remove('drag-over');
  });
  userImageBox.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    userImageBox.classList.remove('drag-over');
    console.log('[TryOn] File dropped:', e.dataTransfer.files);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleUserImageUpload(file);
    }
  });
  userImageInput.addEventListener('change', (e) => {
    console.log('[TryOn] Input change event fired');
    const file = e.target.files[0];
    console.log('[TryOn] Selected file:', file);
    if (file) {
      handleUserImageUpload(file);
    } else {
      console.log('[TryOn] No file selected');
    }
  });

  // Setup garment boxes
  const garmentBoxes = shadow.querySelectorAll('.tryon-garment-box');
  garmentBoxes.forEach((box, index) => setupGarmentBox(box, index));

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

  function setupGarmentBox(box, index) {
    box.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log(`[TryOn] Garment box ${index} clicked`);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          console.log(`[TryOn] File selected for garment ${index}:`, file);
          handleGarmentUpload(file, index);
        }
      };
      input.click();
    });

    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.add('drag-over');
    });

    box.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.remove('drag-over');
    });

    box.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.remove('drag-over');
      console.log(`[TryOn] File dropped on garment box ${index}:`, e.dataTransfer.files);
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        handleGarmentUpload(file, index);
      }
    });
  }

  // Helper: Compress image to reduce payload
  async function compressImage(base64Data, maxWidth = 1080, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = (height / width) * maxWidth;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = base64Data;
    });
  }

  // Pre-upload image to FAL Storage
  async function uploadToFalStorage(base64Image) {
    const res = await fetch(`${BACKEND_URL}/api/images/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: API_KEY,
        image: base64Image
      })
    });
    const data = await res.json();
    if (!data.success) {
      console.error('[TryOn] Upload failed'); throw new Error('No se pudo subir la imagen. Verifica tu conexión.');
    }
    console.log('[TryOn] Pre-uploaded to FAL:', data.url);
    return data.url;
  }

  function handleUserImageUpload(file) {
    console.log('[TryOn] handleUserImageUpload called with:', file);
    if (!file || !file.type.startsWith('image/')) {
      console.log('[TryOn] Invalid file type:', file?.type);
      return;
    }

    console.log('[TryOn] Processing image upload...');
    fileToBase64(file).then(async base64 => {
      console.log('[TryOn] File converted to base64');
      const compressed = await compressImage(base64);
      state.userImage = compressed;
      console.log('[TryOn] Image compressed and stored');
      userImageBox.classList.add('has-image');
      userImagePlaceholder.innerHTML = `
        <img src="${compressed}" alt="User photo">
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

    fileToBase64(file).then(async base64 => {
      const compressed = await compressImage(base64);
      state.garments[index] = compressed;
      console.log('[TryOn] Image compressed');
      const box = shadow.querySelector(`.tryon-garment-box[data-index="${index}"]`);
      box.classList.add('has-image');
      box.innerHTML = `
        <img src="${compressed}" alt="Garment">
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

})();
// Widget updated Mon Feb  2 17:22:03 UTC 2026
