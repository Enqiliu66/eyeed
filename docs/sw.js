// 定义缓存名称和版本
const CACHE_NAME = 'eye-ed-cache-v1.0.3'; // 每次更新时修改版本号
const IMMUTABLE_CACHE = 'eye-ed-immutable-cache-v1.0.0'; // 不变资源缓存

// 需要缓存的资源列表
const urlsToCache = [
  '/',
  '/index.html',
  '/lib/jspsych@8.0.0.js',
  '/lib/plugin-preload@2.0.0.js',
  '/lib/plugin-html-button-response@2.0.0.js',
  '/lib/plugin-html-keyboard-response@2.0.0.js',
  '/lib/plugin-image-keyboard-response@2.0.0.js',
  '/lib/plugin-audio-keyboard-response@2.0.0.js',
  '/lib/plugin-webgazer-init-camera@2.0.0.js',
  '/lib/plugin-webgazer-calibrate@2.0.0.js',
  '/lib/plugin-webgazer-validate@2.0.0.js',
  '/lib/extension-webgazer@1.0.3.js',
  '/lib/plugin-call-function@1.0.0.js',
  '/lib/FileSaver.min@2.0.5.js',
  '/webgazer.js',
  '/images/',
  '/music/'
];

// 长期缓存的不可变资源
const immutableResources = [
  '/lib/',
  '/images/',
  '/music/'
];

// 安装事件 - 缓存资源
self.addEventListener('install', event => {
  console.log('Service Worker 安装中...');

  // 跳过等待，直接激活新SW
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('缓存核心文件');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('所有资源已成功缓存');
        return self.skipWaiting();
      })
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', event => {
  console.log('Service Worker 激活中...');

  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 删除旧版本的缓存
          if (cacheName !== CACHE_NAME && cacheName !== IMMUTABLE_CACHE) {
            console.log('删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker 已激活');
      // 确保SW控制所有客户端
      return self.clients.claim();
    })
  );
});

// 获取事件 - 处理资源请求
self.addEventListener('fetch', event => {
  // 跳过非GET请求和chrome扩展请求
  if (event.request.method !== 'GET' ||
      event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  // 处理API请求 - 不缓存
  if (event.request.url.includes('/api/')) {
    // 对于API请求，使用网络优先策略
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 克隆响应以使用
          return response.clone();
        })
        .catch(error => {
          console.log('API请求失败:', error);
          // 可以返回一个自定义的错误响应
          return new Response(JSON.stringify({
            error: '网络连接失败',
            message: '请检查您的网络连接'
          }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'application/json'
            })
          });
        })
    );
    return;
  }

  // 处理静态资源请求
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 如果在缓存中找到资源，返回缓存版本
        if (response) {
          return response;
        }

        // 克隆请求，因为请求是一次性的
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then(response => {
          // 检查是否收到有效响应
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 克隆响应，因为响应也是一次性的
          const responseToCache = response.clone();

          // 确定是否应该缓存这个资源
          const url = new URL(event.request.url);
          const shouldCache = urlsToCache.some(resource =>
            url.pathname.startsWith(resource) ||
            url.pathname.endsWith('.js') ||
            url.pathname.endsWith('.css')
          );

          if (shouldCache) {
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
          }

          return response;
        });
      })
      .catch(() => {
        // 当网络请求和缓存都失败时，可以返回一个离线页面
        // 这里简单返回一个错误响应
        return new Response('网络连接失败，请检查您的网络设置', {
          status: 404,
          statusText: 'Offline'
        });
      })
  );
});

// 监听消息事件
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

});
