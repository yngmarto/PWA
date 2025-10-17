// Versión del cache - incrementar cuando actualices recursos
const CACHE_VERSION = "shopping-list-cache-v2.0.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Recursos críticos que deben estar en caché para funcionar offline
const STATIC_ASSETS = [
    "/",
    "/index.html",
    "/manifest.json",
    "/192.png",
    "/512.png",
    "/x192.svg"
];

// Evento de instalación
self.addEventListener("install", event => {
    console.log("Service Worker: Instalando...");
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log("Service Worker: Guardando recursos estáticos en caché");
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Forzar la activación inmediata del nuevo service worker
                return self.skipWaiting();
            })
            .catch(error => {
                console.error("Service Worker: Error al instalar", error);
            })
    );
});

// Evento de activación
self.addEventListener("activate", event => {
    console.log("Service Worker: Activando...");
    
    event.waitUntil(
        Promise.all([
            // Limpiar cachés antiguos
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log("Service Worker: Eliminando caché antigua:", cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Limpiar caché dinámico periódicamente
            caches.open(DYNAMIC_CACHE).then(cache => {
                return cache.keys().then(requests => {
                    // Mantener solo los últimos 50 elementos
                    if (requests.length > 50) {
                        const toDelete = requests.slice(0, requests.length - 50);
                        return Promise.all(
                            toDelete.map(request => cache.delete(request))
                        );
                    }
                });
            }),
            // Tomar control de todas las páginas inmediatamente
            self.clients.claim()
        ])
    );
});

// Estrategia Cache First - para recursos estáticos
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        
        // Guardar en caché dinámico si es exitoso
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error("Cache First falló:", error);
        throw error;
    }
}

// Estrategia Network First - para datos dinámicos
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log("Network falló, intentando caché:", error);
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Si no hay caché y es una navegación, devolver página offline
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        
        throw error;
    }
}

// Interceptar todas las peticiones
self.addEventListener("fetch", event => {
    const { request } = event;
    
    // Solo manejar peticiones HTTP/HTTPS del mismo origen
    if (!request.url.startsWith('http')) {
        return;
    }
    
    // Manejar actualizaciones del service worker
    if (event.request.url.includes('sw.js')) {
        event.respondWith(
            fetch(event.request).then(response => {
                // Verificar si hay una nueva versión
                if (response.status === 200) {
                    const newResponse = response.clone();
                    newResponse.text().then(text => {
                        if (text !== self.scriptContent) {
                            self.scriptContent = text;
                            // Notificar a los clientes sobre la actualización
                            self.clients.matchAll().then(clients => {
                                clients.forEach(client => {
                                    client.postMessage({
                                        type: 'SW_UPDATED'
                                    });
                                });
                            });
                        }
                    });
                }
                return response;
            })
        );
        return;
    }
    
    // Estrategia Cache First para recursos estáticos
    if (request.destination === 'document' || 
        request.destination === 'script' || 
        request.destination === 'style' ||
        request.destination === 'image' ||
        request.destination === 'manifest') {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // Estrategia Network First para otros recursos (API calls, etc.)
    event.respondWith(networkFirst(request));
});

// Manejar actualizaciones del service worker
self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});


console.log("Service Worker: Cargado y listo para funcionar offline");