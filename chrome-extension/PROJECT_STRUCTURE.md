# STOMP WebSocket Interceptor & Replayer — Proje Mimarisi ve Klasör Yapısı

Bu doküman, **STOMP WebSocket Interceptor & Replayer** Chrome Eklentisi ve entegre test ortamının genel mimarisini, kullanılan teknolojileri, güncel dosya yapısını ve bileşen işlevlerini ayrıntılı olarak açıklamaktadır.

---

## 📌 Proje Özeti ve Amacı

Bu sistem, web istemcileri (React, Angular, Vue, Vanilla JS vb.) ile sunucu (Spring Boot STOMP Broker vb.) arasında **WebSocket** üzerinden iletilen **STOMP (Simple Text Oriented Messaging Protocol)** mesajlarını yakalayan, kaydeden, inceleyen, düzenleyen ve tekrar oynatan (replay) profesyonel bir **Chrome Extension (Manifest V3)** ve beraberindeki **Canlı Radar Konsolu** test sunucusudur.

### 🌟 Temel Özellikler
- **Canlı Dinleme (Intercepting)**: `chrome.debugger` API'si (Chrome DevTools Protocol) ile düşük seviyeli WebSocket paketlerini tarayıcı katmanında kesintisiz dinler.
- **Ayrıştırma & Doğrulama (Parsing)**: STOMP paketlerini (`CONNECT`, `SUBSCRIBE`, `SEND`, `MESSAGE`, `UNSUBSCRIBE` vb.) komut, başlıklar (headers) ve gövde (body) bölümlerine eksiksiz ayırır.
- **IndexedDB Depolama**: Kaydedilen oturumları ve paket akışını **Dexie.js** kütüphanesi ile yerel tarayıcı veritabanında saklar.
- **Detaylı Paket & Oturum Yönetimi**:
  - Çoklu veya tekil paket silme (`Delete Frame`),
  - Oturum silme (`Delete Session`),
  - JSON formatında içe/dışa aktarma (`Export/Import JSON`).
- **Gelişmiş JSON Editörü**: Ham metin ve interaktif ağaç (Tree) görünümü arasında geçiş imkanı, anlık sözdizimi doğrulama.
- **Çift Yönlü Replay Engine**:
  1. **CLIENT Mode (Varsayılan)**: Kaydedilen mesajları web istemcisi gibi WebSocket üzerinden doğrudan sunucuya tekrar iletir.
  2. **SERVER_MOCK Mode**: Sunucudan gelmiş gibi mesajları DevTools Protocol üzerinden doğrudan tarayıcı STOMP istemcisine enjekte eder.
- **Entegre Askeri Radar Test Konsolu (`localhost:8080`)**:
  - `/topic/signal`, `/topic/systemstatus`, `/topic/target`, `/topic/alert` kanalları.
  - Canlı 360° döner tarama ışınlı taktik radar skopu, tam çerçeve ızgara ve çoklu hedef renklendirmesi (🟢 SIGNAL, 🟡 TARGET, 🔴 ALERT).

---

## 🛠️ Teknoloji Yığını (Tech Stack)

| Katman | Teknoloji | Açıklama |
| :--- | :--- | :--- |
| **Uzantı Dili** | TypeScript 5+ | Tip güvenliği ve `strict: true` yapılandırması |
| **Uzantı UI** | React 19 | Pop-up ve Dashboard modern arayüz bileşenleri |
| **Paketleyici (Bundler)** | Vite 6 + `@crxjs/vite-plugin` | Manifest V3 uyumlu hızlı HMR ve üretim derleyicisi |
| **Veritabanı** | Dexie.js 4+ | IndexedDB üzerinde nesne tabanlı yerel depolama |
| **Tipografi** | Google Fonts | `Inter` (UI) ve `JetBrains Mono` (Teknik veriler & loglar) |
| **Tasarım / CSS** | Vanilla CSS (Variables) | Modern koyu tema (Deep Obsidian), cam efekti ve taktik renk paleti |
| **Extension APIs** | Chrome Extension MV3 | `debugger`, `scripting`, `tabs`, `storage`, `activeTab` |
| **Test Backend** | Spring Boot 3.4.2 (Java 17) | WebSocket & STOMP Broker, Simüle AESA Radar Yayıncısı |

---

## 📂 Klasör ve Dosya Yapısı

```
stomp-interceptor-main/
│
├── backend/                                    # Test ve Doğrulama Spring Boot Sunucusu (localhost:8080)
│   ├── src/main/java/com/example/stomp/
│   │   ├── StompApplication.java               # Spring Boot Ana Başlatıcı Sınıfı
│   │   ├── config/
│   │   │   └── WebSocketConfig.java            # STOMP /ws Endpoint ve /topic, /app Broker Ayarları
│   │   ├── controller/
│   │   │   └── StompMessageController.java     # /signal, /target, /alert, /systemstatus İşleyicileri
│   │   ├── model/
│   │   │   └── ChatMessage.java                # Mesaj Veri Modeli
│   │   └── service/
│   │       └── HeartbeatPublisher.java         # /topic/systemstatus Periyodik Telemetri Yayıncısı
│   │
│   ├── src/main/resources/
│   │   ├── application.properties              # Sunucu Port ve Yapılandırması (8080)
│   │   └── static/                             # C2 Radar Konsolu Web Arayüzü
│   │       ├── index.html                      # Konsol Arayüzü (HTML5 + 360° Radar Canvas)
│   │       ├── css/style.css                   # Taktik Koyu Tema, Izgara Deseni ve Hover Efektleri
│   │       └── js/
│   │           ├── stomp-client.js             # Hafif STOMP İstemci Kütüphanesi
│   │           └── app.js                      # Radar Çizim Motoru, Şablonlar & WebSocket Yönetimi
│   └── pom.xml                                 # Maven Bağımlılıkları ve Yapılandırması
│
└── chrome-extension/                           # Chrome Eklentisi Ana Kaynak Kodları
    ├── dist/                                   # Derlenmiş Üretim Çıktısı (Chrome'a yüklenen klasör)
    │   ├── manifest.json                       # Derleme sonrası Manifest V3 yapılandırması
    │   ├── service-worker-loader.js            # Background Service Worker başlatıcısı
    │   └── assets/                             # Paketlenmiş JS, CSS ve HTML dosyaları
    │
    ├── src/                                    # TypeScript & React Kaynak Kodları
    │   ├── types/
    │   │   └── index.ts                        # StompFrame, Session, FrameRecord ve Mesajlaşma Tipleri
    │   │
    │   ├── lib/
    │   │   ├── stomp-parser.ts                 # STOMP 1.0/1.1/1.2 Frame Parser & Serializer
    │   │   └── db.ts                           # Dexie.js IndexedDB Veritabanı ve CRUD Yöneticisi
    │   │
    │   ├── background/
    │   │   └── index.ts                        # Service Worker (chrome.debugger & Çift Yönlü Replay Engine)
    │   │
    │   ├── components/                         # Modüler React UI Bileşenleri
    │   │   ├── DirectionTag.tsx                # SENT / RECEIVED yön etiketi rozeti
    │   │   ├── StatusPill.tsx                  # Recording / Idle durum göstergesi
    │   │   ├── SessionCard.tsx                 # Oturum listesi kartı
    │   │   ├── SessionDropdown.tsx             # Hızlı oturum seçici açılır menü
    │   │   ├── LiveFeedFrame.tsx               # Canlı yakalanan STOMP mesajı önizleme rozeti
    │   │   ├── FrameTable.tsx                  # Mesaj tablosu, çoklu seçim, arama ve filtreleme
    │   │   ├── FrameInspector.tsx              # Sağ panel: Header'lar, JSON Editor, Tekil Silme & Replay
    │   │   ├── JsonEditor.tsx                  # Kod / Ağaç Görünümlü İnteraktif JSON Editörü
    │   │   ├── JsonEditor.css                  # JSON Editörü Stilleri
    │   │   ├── Toast.tsx                       # Bildirim (Toast) Mesaj Bileşeni
    │   │   └── Toast.css                       # Bildirim Stilleri
    │   │
    │   ├── popup/                              # Popup Arayüzü (Toolbar İkonuna Basılınca Açılır)
    │   │   ├── index.html                      # Popup HTML Şablonu
    │   │   ├── main.tsx                        # Popup React Başlangıç Noktası
    │   │   ├── Popup.tsx                       # Popup Ana Kontrol Paneli
    │   │   └── Popup.css                       # Popup Stilleri
    │   │
    │   └── dashboard/                          # Tam Ekran Dashboard Arayüzü
    │       ├── index.html                      # Dashboard HTML Şablonu
    │       ├── main.tsx                        # Dashboard React Başlangıç Noktası
    │       ├── Dashboard.tsx                   # Dashboard Ana Sayfası ve Oturum Yöneticisi
    │       └── Dashboard.css                   # Dashboard Stilleri
    │
    ├── manifest.json                           # Chrome Extension Manifest V3 Tanımı
    ├── vite.config.js                          # Vite & CRXJS Derleyici Konfigürasyonu
    ├── tsconfig.json                           # TypeScript Ayarları
    ├── package.json                            # npm Paket Bağımlılıkları ve Scriptleri
    ├── PROJECT_STRUCTURE.md                    # Proje Mimarisi ve Klasör Yapısı Dokümanı
    └── README.md                               # Genel Tanıtım ve Kurulum Kılavuzu
```

---

## ⚡ Modüllerin ve Bileşenlerin Detaylı İncelemesi

### 1. `src/types/index.ts`
- **`StompFrame`**: `command`, `headers`, `body`, `rawPayload` ve `timestamp` içeren temel STOMP veri yapısı.
- **`Session`**: Kaydedilen oturumun ID'si, adı, başlangıç/bitiş zamanı, sekme URL'si ve paket sayısını (`frameCount`) tutar.
- **`FrameRecord`**: Veritabanında saklanan her bir paketin yönünü (`SENT` / `RECEIVED`), oturum ID'sini ve STOMP ayrıntılarını tanımlar.
- **`ReplayMode`**: `'CLIENT'` (WebSockets üzerinden iletme) ve `'SERVER_MOCK'` (DevTools protokolü üzerinden enjekte etme) modları.

### 2. `src/lib/stomp-parser.ts`
- `parseStompFrames(rawText)`: WebSocket üzerinden akan ham metni (`\u0000` NULL byte ile sonlanan) STOMP komutlarına, header satırlarına ve JSON gövdeye ayrıştırır.
- `serializeStompFrame(frame)`: Düzenlenmiş frame nesnesini standart STOMP protokol formatında metne dönüştürür.

### 3. `src/lib/db.ts`
- Dexie tabanlı `StompInterceptorDB` veritabanı sınıfı:
  - `sessions` tablosu: Oturum metaverileri.
  - `frames` tablosu: Yakalanan tüm STOMP paketleri.
- **CRUD Fonksiyonları**:
  - `deleteSession(sessionId)`: Oturumu ve ona bağlı tüm frame'leri temizler.
  - `deleteFrame(frameId, sessionId)`: Tek bir frame'i siler ve oturumun `frameCount` değerini günceller.
  - `deleteFrames(frameIds, sessionId)`: Seçili frame'leri topluca siler.
  - `exportSessionJSON(sessionId)` / `importSessionJSON(jsonString)`: Oturumları JSON olarak dışa aktarır ve içeri alır.

### 4. `src/background/index.ts` (Service Worker)
- **`chrome.debugger` Dinleyicisi**: `Network.webSocketFrameReceived` ve `Network.webSocketFrameSent` olaylarını yakalar.
- **Replay Motoru**:
  - `CLIENT` modunda sekmede çalışan STOMP istemcisine mesaj gönderir.
  - `SERVER_MOCK` modunda `Network.webSocketFrameReceived` taklit ederek sunucu mesajı gibi tarayıcıya iletir.

### 5. `src/components/` UI Bileşenleri
- **`FrameTable.tsx`**: Oturumdaki paketleri tablo halinde listeler, metin araması, komut (`SEND`, `MESSAGE` vb.) ve yön (`SENT`, `RECEIVED`) filtrelemesi sunar.
- **`FrameInspector.tsx`**: Seçilen paketin başlıklarını, gövdesini ve ham yükünü gösterir; JSON düzenleme, tekil frame silme ve tekil frame replay imkanı sağlar.
- **`JsonEditor.tsx`**: Hem ham JSON kod editörü hem de interaktif ağaç (Tree) gezgini sunar.
- **`Toast.tsx`**: Kullanıcıya anlık başarı, uyarı ve hata bildirimlerini zarif animasyonlarla iletir.

---

## 🚀 Derleme ve Çalıştırma Komutları

### Chrome Eklentisi (`chrome-extension/`)
```powershell
# Bağımlılıkları yükleme
npm install

# Üretim derlemesi (dist/ klasörünü oluşturur)
npm run build

# Geliştirme modu (değişiklikleri otomatik derler)
npm run watch
```

### Test Backend Sunucusu (`backend/`)
```powershell
# Maven ile Spring Boot uygulamasını başlatma (localhost:8080)
mvn spring-boot:run
```

---

## 🧩 Chrome'a Yükleme Adımları

1. `chrome-extension` klasöründe `npm run build` komutunu çalıştırın.
2. Google Chrome'da `chrome://extensions` sayfasına gidin.
3. Sağ üst köşedeki **Geliştirici modunu (Developer mode)** açın.
4. **Paketlenmemiş öğe yükle (Load unpacked)** butonuna tıklayın.
5. `stomp-interceptor-main/chrome-extension/dist` klasörünü seçin.
